const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const ICO_HEADER = Buffer.from([
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
  0x00,
  0x01,
  0x01,
  0x00,
  0x00,
  0x01,
  0x00,
  0x20,
  0x00,
  PNG_1X1.length,
  0x00,
  0x00,
  0x00,
  0x16,
  0x00,
  0x00,
  0x00,
]);

export const PORTFOLIO_FAVICON = Buffer.concat([ICO_HEADER, PNG_1X1]);
