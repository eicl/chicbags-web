export const placeholderImage = (
  label: string,
  width = 640,
  height = 800,
  bg = "#1c1c1c",
  fg = "#c9c9c9",
  textY = "40%"
) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <text x="50%" y="${textY}" fill="${fg}" font-family="sans-serif" font-size="${Math.round(width / 14)}" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
