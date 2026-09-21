// Cliente directo de SUNAT (SEE - Del Contribuyente) para emitir boletas de
// venta electrónicas — mismo criterio que whatsapp.js/migo.js: módulo ESM
// propio, fetch plano, credenciales de process.env leídas al cargar, nunca
// en la base de datos. A diferencia de esos dos, acá SÍ hace falta armar
// XML firmado y un sobre SOAP a mano, porque el esquema de SUNAT es
// suficientemente estricto (orden de elementos, namespaces) como para que
// un serializador genérico sea un riesgo real de no calzar.
//
// Este módulo no importa nada de index.js (mismo patrón unidireccional que
// ya usan whatsapp.js/migo.js) — recibe la fecha/hora de Lima ya formateada
// como parámetro en vez de duplicar la lógica de zona horaria.
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";

const SUNAT_RUC = process.env.SUNAT_RUC || "";
const SUNAT_RAZON_SOCIAL = process.env.SUNAT_RAZON_SOCIAL || "";
const SUNAT_NOMBRE_COMERCIAL = process.env.SUNAT_NOMBRE_COMERCIAL || SUNAT_RAZON_SOCIAL;
const SUNAT_DIRECCION_FISCAL = process.env.SUNAT_DIRECCION_FISCAL || "";
const SUNAT_UBIGEO = process.env.SUNAT_UBIGEO || "";
const SUNAT_SOL_USER = process.env.SUNAT_SOL_USER || "";
const SUNAT_SOL_PASSWORD = process.env.SUNAT_SOL_PASSWORD || "";
const SUNAT_CERT_P12_BASE64 = process.env.SUNAT_CERT_P12_BASE64 || "";
const SUNAT_CERT_PASSWORD = process.env.SUNAT_CERT_PASSWORD || "";

// Default "beta" a propósito: un despliegue con SUNAT_ENV mal configurado
// (o sin configurar) nunca debe terminar mandando documentos reales.
const SUNAT_ENV = process.env.SUNAT_ENV === "produccion" ? "produccion" : "beta";
const BILL_SERVICE_URL =
  SUNAT_ENV === "produccion"
    ? "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService"
    : "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService";

// Catálogo 06 de SUNAT (Tipo de Documento de Identidad). documentType en
// este sistema es texto libre elegido en un <select> (ver CustomerRegister,
// AdminCustomers) — este mapeo es la única traducción que hace falta.
export const DOCUMENT_TYPE_CODES = {
  DNI: "1",
  "Carné de Extranjería": "4",
  RUC: "6",
  Pasaporte: "7",
};
export const documentTypeCode = (documentType) => DOCUMENT_TYPE_CODES[documentType] ?? "0";
const DOCUMENT_TYPE_LABELS = { "1": "DNI", "4": "Carné de Extranjería", "6": "RUC", "7": "Pasaporte", "0": "Doc." };
export const documentTypeLabel = (code) => DOCUMENT_TYPE_LABELS[code] ?? "Doc.";

let cachedCertificate = null;
let certificateLoadAttempted = false;

// Node no puede parsear PKCS#12 (.p12/.pfx) con su módulo crypto nativo —
// node-forge lo hace y lo deja en PEM, cacheado una sola vez. Nunca revienta
// al cargar el módulo (mismo criterio que migo.js): si falta configuración
// o el certificado/clave no calzan, devuelve null y queda logueado.
export const loadCertificate = () => {
  if (certificateLoadAttempted) return cachedCertificate;
  certificateLoadAttempted = true;
  if (!SUNAT_CERT_P12_BASE64 || !SUNAT_CERT_PASSWORD || !SUNAT_RUC || !SUNAT_SOL_USER || !SUNAT_SOL_PASSWORD) {
    console.warn("SUNAT no está configurado (faltan variables de entorno) — se omite la emisión de boletas.");
    return null;
  }
  try {
    const p12Der = forge.util.decode64(SUNAT_CERT_P12_BASE64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, SUNAT_CERT_PASSWORD);
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag];
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
    if (!keyBags?.length || !certBags?.length) {
      throw new Error("El certificado P12 no tiene clave privada o certificado");
    }
    cachedCertificate = {
      privateKeyPem: forge.pki.privateKeyToPem(keyBags[0].key),
      certPem: forge.pki.certificateToPem(certBags[0].cert),
    };
    return cachedCertificate;
  } catch (err) {
    console.error("No se pudo cargar el certificado SUNAT_CERT_P12_BASE64:", err.message);
    return null;
  }
};

// Redondeo a 2 decimales sin el drift típico de punto flotante (0.1+0.2).
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// El sistema nunca guardó el IGV por separado (los precios ya lo incluyen,
// como es estándar en retail peruano) — acá es donde se deriva por
// primera vez, por ítem. El total del documento se arma como la suma de
// estos montos por línea ya redondeados (no recalculado aparte desde
// order.total), para que el XML sea internamente consistente aunque eso
// implique un desvío de centavos frente a order.total en pedidos con
// muchos ítems — caso borde a vigilar contra el ambiente beta.
export const computeIgvBreakdown = (items) => {
  const lines = items.map((item) => {
    const opGravada = round2(item.subtotal / 1.18);
    const igv = round2(item.subtotal - opGravada);
    return { ...item, opGravada, igv };
  });
  const opGravada = round2(lines.reduce((sum, l) => sum + l.opGravada, 0));
  const igv = round2(lines.reduce((sum, l) => sum + l.igv, 0));
  const total = round2(opGravada + igv);
  return { lines, opGravada, igv, total };
};

// Conversor número → letras en español, para cbc:Note (monto en letras),
// que SUNAT exige en el XML. Cubre hasta 999,999,999.99 — de sobra para un
// pedido de carteras.
const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const DECENAS_10_19 = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

const hundredsToWords = (n) => {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const rest = n % 100;
  let text = c > 0 ? `${CENTENAS[c]} ` : "";
  if (rest >= 10 && rest < 20) {
    text += DECENAS_10_19[rest - 10];
  } else if (rest === 20) {
    text += "VEINTE";
  } else if (rest > 20 && rest < 30) {
    text += `VEINTI${UNIDADES[rest - 20]}`;
  } else {
    const d = Math.floor(rest / 10);
    const u = rest % 10;
    text += DECENAS[d];
    if (d > 0 && u > 0) text += " Y ";
    text += UNIDADES[u];
  }
  return text.trim();
};

const integerToWords = (n) => {
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1000000);
  const miles = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;
  const parts = [];
  if (millones > 0) parts.push(millones === 1 ? "UN MILLÓN" : `${hundredsToWords(millones)} MILLONES`);
  if (miles > 0) parts.push(miles === 1 ? "MIL" : `${hundredsToWords(miles)} MIL`);
  if (resto > 0) parts.push(hundredsToWords(resto));
  return parts.join(" ").trim();
};

export const amountToWords = (amount, currencyLabel = "SOLES") => {
  const entero = Math.floor(amount);
  const centimos = Math.round((amount - entero) * 100);
  return `${integerToWords(entero)} CON ${String(centimos).padStart(2, "0")}/100 ${currencyLabel}`;
};

const escapeXml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Arma el XML UBL 2.1 de Boleta de Venta Electrónica sin firmar. Estructura
// y orden de elementos verificados contra un ejemplo real generado por
// Greenter (librería SUNAT de referencia ampliamente usada en Perú) — el
// orden importa, la validación de esquema de SUNAT es estricta con esto.
// El correlativo NO va con ceros a la izquierda en cbc:ID (confirmado en
// el ejemplo de referencia: "B001-1", no "B001-00000001").
export const buildBoletaXml = ({ serie, correlativo, issueDateLima, issueTimeLima, customer, breakdown }) => {
  const id = `${serie}-${correlativo}`;
  const customerDocType = documentTypeCode(customer.documentType);
  const customerFullName = [customer.firstName, customer.paternalSurname, customer.maternalSurname].filter(Boolean).join(" ");
  const amountWords = amountToWords(breakdown.total);

  const lines = breakdown.lines
    .map((item, index) => {
      const lineId = index + 1;
      const unitPriceWithIgv = round2(item.unitPrice);
      const unitPriceWithoutIgv = round2(unitPriceWithIgv / 1.18);
      return `
    <cac:InvoiceLine>
      <cbc:ID>${lineId}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="NIU">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="PEN">${item.opGravada.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:PricingReference>
        <cac:AlternativeConditionPrice>
          <cbc:PriceAmount currencyID="PEN">${unitPriceWithIgv.toFixed(2)}</cbc:PriceAmount>
          <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
        </cac:AlternativeConditionPrice>
      </cac:PricingReference>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="PEN">${item.igv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="PEN">${item.opGravada.toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="PEN">${item.igv.toFixed(2)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:Percent>18</cbc:Percent>
            <cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>
            <cac:TaxScheme>
              <cbc:ID>1000</cbc:ID>
              <cbc:Name>IGV</cbc:Name>
              <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Description><![CDATA[${escapeXml(item.productName)}${item.colorName ? ` - ${item.colorName}` : ""}]]></cbc:Description>
        <cac:SellersItemIdentification>
          <cbc:ID>${escapeXml(item.productCode || String(item.productId ?? item.serviceId ?? ""))}</cbc:ID>
        </cac:SellersItemIdentification>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="PEN">${unitPriceWithoutIgv.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${id}</cbc:ID>
  <cbc:IssueDate>${issueDateLima}</cbc:IssueDate>
  <cbc:IssueTime>${issueTimeLima}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">03</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000"><![CDATA[${amountWords}]]></cbc:Note>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  <cac:Signature>
    <cbc:ID>${escapeXml(SUNAT_RUC)}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${escapeXml(SUNAT_RUC)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${SUNAT_NOMBRE_COMERCIAL}]]></cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#ChicBagsSignature</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${escapeXml(SUNAT_RUC)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${SUNAT_NOMBRE_COMERCIAL}]]></cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${SUNAT_RAZON_SOCIAL}]]></cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID>${escapeXml(SUNAT_UBIGEO)}</cbc:ID>
          <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
          <cac:AddressLine>
            <cbc:Line><![CDATA[${SUNAT_DIRECCION_FISCAL}]]></cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${customerDocType}">${escapeXml(customer.documentNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${escapeXml(customerFullName)}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="PEN">${breakdown.igv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="PEN">${breakdown.opGravada.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="PEN">${breakdown.igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:ID>1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="PEN">${breakdown.opGravada.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="PEN">${breakdown.total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="PEN">${breakdown.total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>`;
};

// Firma envelope XML-DSig, con la firma dentro de ext:UBLExtensions (no en
// la raíz del documento, que es el requisito no estándar de SUNAT) — via
// el xpath location de xml-crypto. La referencia cubre el documento
// completo (mismo criterio que toda la documentación/librerías de
// referencia de SUNAT usan).
export const signXml = (unsignedXml) => {
  const cert = loadCertificate();
  if (!cert) throw new Error("SUNAT no está configurado");
  const sig = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  sig.addReference({
    xpath: "//*[local-name(.)='Invoice']",
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"],
    isEmptyUri: true,
  });
  sig.computeSignature(unsignedXml, {
    prefix: "ds",
    location: { reference: "//*[local-name(.)='ExtensionContent']", action: "append" },
  });
  return sig.getSignedXml();
};

// ZIP con el nombre y contenido exigidos por SUNAT: un solo archivo
// {RUC}-{tipoDoc}-{serie}-{correlativo}.xml dentro de un zip con el mismo
// nombre base.
export const buildZip = async ({ ruc, serie, correlativo, signedXml }) => {
  const baseName = `${ruc}-03-${serie}-${correlativo}`;
  const zip = new JSZip();
  zip.file(`${baseName}.xml`, signedXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, filename: `${baseName}.zip` };
};

// Sobre SOAP 1.1 armado a mano (namespaces/estructura verificados contra un
// ejemplo real de envío a SUNAT) — WS-Security UsernameToken con el usuario
// secundario SOL. Lanza excepción en fallo de red/timeout; el caller
// distingue eso de un rechazo de SUNAT (ver POST /api/orders/:id/boleta).
export const sendBillToSunat = async (zipBuffer, zipFilename) => {
  const username = `${SUNAT_RUC}${SUNAT_SOL_USER}`;
  const contentBase64 = zipBuffer.toString("base64");
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ser="http://service.sunat.gob.pe"
  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${escapeXml(username)}</wsse:Username>
        <wsse:Password>${escapeXml(SUNAT_SOL_PASSWORD)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:sendBill>
      <fileName>${escapeXml(zipFilename)}</fileName>
      <contentFile>${contentBase64}</contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`;

  const response = await fetch(BILL_SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml;charset=UTF-8", SOAPAction: "" },
    body: envelope,
    signal: AbortSignal.timeout(30000),
  });
  return response.text();
};

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

// Distingue un soap:Fault (falla de autenticación, petición mal formada
// rechazada antes de procesarse) de una respuesta normal con CDR adjunto.
export const parseSendBillResponse = async (soapText) => {
  const parsed = xmlParser.parse(soapText);
  const body = parsed?.Envelope?.Body;
  if (!body) throw new Error("Respuesta SOAP de SUNAT sin cuerpo reconocible");

  const fault = body.Fault;
  if (fault) {
    return { fault: { code: fault.faultcode ?? fault.Code?.Value ?? "", message: fault.faultstring ?? fault.Reason?.Text ?? "" } };
  }

  const base64Zip = body.sendBillResponse?.applicationResponse;
  if (!base64Zip) throw new Error("Respuesta de SUNAT sin applicationResponse ni Fault reconocible");

  const cdrZipBuffer = Buffer.from(base64Zip, "base64");
  const cdrZip = await JSZip.loadAsync(cdrZipBuffer);
  const cdrEntry = Object.values(cdrZip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith(".xml"));
  if (!cdrEntry) throw new Error("El CDR de SUNAT no contiene un XML");
  const cdrXml = await cdrEntry.async("string");
  const cdrParsed = xmlParser.parse(cdrXml);
  const documentResponse = cdrParsed?.ApplicationResponse?.DocumentResponse ?? cdrParsed?.ApplicationResponse;
  const response = documentResponse?.Response ?? documentResponse;
  const responseCode = String(response?.ResponseCode ?? "");
  const description = String(response?.Description ?? "");

  return { cdrZipBuffer, responseCode, description };
};

// "0" = aceptado. El resto de códigos de observación documentados por
// SUNAT (rango 2000-4000 aprox son errores/rechazos; hay un subconjunto de
// "observaciones" que igual acepta el comprobante) — lista de arranque, a
// refinar con respuestas reales contra el ambiente beta.
const OBSERVATION_CODES = new Set(["2335", "2324", "4294", "4295", "4296", "4297"]);
export const classifyCdrStatus = (responseCode) => {
  if (responseCode === "0") return "aceptado";
  if (OBSERVATION_CODES.has(responseCode)) return "aceptado_con_observaciones";
  return "rechazado";
};

// Contenido del código QR exigido por SUNAT en la representación impresa
// (Resolución 189-2015/SUNAT y modificatorias): 9 campos separados por "|",
// en este orden exacto, terminados en un "|" final. No incluye el hash de
// la firma digital (10mo campo, opcional) — no hace falta para que el QR
// sea legible/verificable contra la consulta pública de SUNAT.
export const buildBoletaQrText = ({ serie, correlativo, issueDateLima, customerDocTypeCode, customerDocNumber, breakdown }) =>
  [SUNAT_RUC, "03", serie, correlativo, breakdown.igv.toFixed(2), breakdown.total.toFixed(2), issueDateLima, customerDocTypeCode, customerDocNumber, ""].join("|");

export const buildBoletaQrPng = (qrText) => QRCode.toBuffer(qrText, { errorCorrectionLevel: "M", margin: 1, width: 200 });

const money = (n) => `S/ ${n.toFixed(2)}`;

// Representación impresa (PDF) de la boleta — generada al vuelo a partir de
// lo ya guardado (nunca se persiste el PDF en sí, es barato de rearmar y
// así nunca queda desactualizado respecto al XML/CDR reales). No es el
// comprobante legal (eso es el XML firmado) — es la vista para
// imprimir/mandarle al cliente, con el QR que exige SUNAT.
export const buildBoletaPdf = ({ serie, correlativo, issueDateLima, customerName, customerDocLabel, customerDocNumber, breakdown, qrPng }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(13).text(SUNAT_NOMBRE_COMERCIAL || SUNAT_RAZON_SOCIAL, 40, 40, { width: 320 });
    doc.font("Helvetica").fontSize(9);
    doc.text(SUNAT_RAZON_SOCIAL, { width: 320 });
    doc.text(`RUC ${SUNAT_RUC}`, { width: 320 });
    doc.text(SUNAT_DIRECCION_FISCAL, { width: 320 });

    const boxX = 380;
    const boxY = 40;
    const boxW = 175;
    const boxH = 70;
    doc.rect(boxX, boxY, boxW, boxH).stroke();
    doc.font("Helvetica-Bold").fontSize(10).text(`RUC ${SUNAT_RUC}`, boxX, boxY + 8, { width: boxW, align: "center" });
    doc.fontSize(10).text("BOLETA DE VENTA ELECTRÓNICA", boxX + 5, boxY + 26, { width: boxW - 10, align: "center" });
    doc.fontSize(13).text(`${serie}-${correlativo}`, boxX, boxY + 50, { width: boxW, align: "center" });

    let y = 130;
    doc.font("Helvetica").fontSize(9);
    doc.text(`Fecha de emisión: ${issueDateLima}`, 40, y);
    y += 14;
    doc.text(`Cliente: ${customerName}`, 40, y);
    y += 14;
    doc.text(`${customerDocLabel}: ${customerDocNumber}`, 40, y);
    y += 24;

    const col = { cant: 40, desc: 80, punit: 380, importe: 460 };
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("Cant.", col.cant, y);
    doc.text("Descripción", col.desc, y);
    doc.text("P. Unit.", col.punit, y, { width: 70, align: "right" });
    doc.text("Importe", col.importe, y, { width: 70, align: "right" });
    y += 14;
    doc.moveTo(40, y).lineTo(530, y).stroke();
    y += 6;

    doc.font("Helvetica").fontSize(9);
    for (const item of breakdown.lines) {
      const description = `${item.productName}${item.colorName ? ` - ${item.colorName}` : ""}`;
      const rowHeight = Math.max(14, doc.heightOfString(description, { width: 290 }));
      doc.text(String(item.quantity), col.cant, y);
      doc.text(description, col.desc, y, { width: 290 });
      doc.text(item.unitPrice.toFixed(2), col.punit, y, { width: 70, align: "right" });
      doc.text(item.subtotal.toFixed(2), col.importe, y, { width: 70, align: "right" });
      y += rowHeight + 4;
    }
    y += 6;
    doc.moveTo(40, y).lineTo(530, y).stroke();
    y += 10;

    doc.font("Helvetica").fontSize(9);
    doc.text("Op. Gravada:", 380, y, { width: 80 });
    doc.text(money(breakdown.opGravada), 460, y, { width: 70, align: "right" });
    y += 14;
    doc.text("IGV (18%):", 380, y, { width: 80 });
    doc.text(money(breakdown.igv), 460, y, { width: 70, align: "right" });
    y += 14;
    doc.font("Helvetica-Bold");
    doc.text("Importe Total:", 380, y, { width: 80 });
    doc.text(money(breakdown.total), 460, y, { width: 70, align: "right" });
    y += 22;

    doc.font("Helvetica").fontSize(9).text(`Son: ${amountToWords(breakdown.total)}`, 40, y, { width: 490 });
    y = doc.y + 20;

    doc.image(qrPng, 40, y, { width: 90 });
    doc.fontSize(7).text(
      "Representación impresa de la Boleta de Venta Electrónica. Consulte este comprobante en www.sunat.gob.pe",
      140,
      y + 10,
      { width: 390 }
    );

    doc.end();
  });
