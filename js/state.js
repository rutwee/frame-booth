// ==========================================================================
// DEVICE CATALOG + SHARED APP STATE
// ==========================================================================

// Creates one normalized device geometry object.
const device = (group, originalWidth, originalHeight, screen, island) => ({
  group,
  originalWidth,
  originalHeight,
  screen: { ...screen, island },
});

const G = {
  i17: device("iPhone 17", 1350, 2760, { x: 70, y: 67, width: 1210, height: 2626, cornerRadius: 180 }, { x: 489, y: 113, width: 372, height: 105, cornerRadius: 52 }),
  i17pro: device("iPhone 17 Pro", 1350, 2760, { x: 70, y: 67, width: 1210, height: 2626, cornerRadius: 180 }, { x: 489, y: 113, width: 372, height: 105, cornerRadius: 52 }),
  i17proMax: device("iPhone 17 Pro Max", 1470, 3000, { x: 73, y: 64, width: 1324, height: 2872, cornerRadius: 180 }, { x: 549, y: 110, width: 372, height: 106, cornerRadius: 52 }),
  air: device("iPhone Air", 1380, 2880, { x: 58, y: 70, width: 1264, height: 2740, cornerRadius: 180 }, { x: 504, y: 135, width: 372, height: 105, cornerRadius: 52 }),
  i16: device("iPhone 16", 1359, 2736, { x: 88, y: 88, width: 1183, height: 2560, cornerRadius: 160 }, { x: 493, y: 124, width: 374, height: 109, cornerRadius: 52 }),
  i16plus: device("iPhone 16 Plus", 1470, 2970, { x: 88, y: 85, width: 1294, height: 2800, cornerRadius: 160 }, { x: 545, y: 123, width: 380, height: 107, cornerRadius: 53.5 }),
  i16pro: device("iPhone 16 Pro", 1350, 2760, { x: 70, y: 67, width: 1210, height: 2626, cornerRadius: 180 }, { x: 487, y: 107, width: 376, height: 112, cornerRadius: 52 }),
  i16proMax: device("iPhone 16 Pro Max", 1470, 3000, { x: 73, y: 64, width: 1324, height: 2872, cornerRadius: 180 }, { x: 548, y: 109, width: 374, height: 108, cornerRadius: 54 }),
};

// Builds frame records while preserving exact IDs, labels, order, and file paths.
const build = (idPrefix, namePrefix, srcBase, geometry, variants) =>
  variants.map(([idSuffix, label, file]) => ({
    id: `${idPrefix}-${idSuffix}`,
    name: `${namePrefix} ${label}`,
    src: `${srcBase}/${file}`,
    ...geometry,
  }));

export const frames = [
  ...build("iphone-17", "iPhone 17", "assets/iphone_17/iPhone_17", G.i17, [
    ["black", "Black", "17_black.png"],
    ["white", "White", "17_white.png"],
    ["lavender", "Lavender", "17_lavender.png"],
    ["mistblue", "Mist Blue", "17_mistblue.png"],
    ["sage", "Sage", "17_sage.png"],
  ]),
  ...build("iphone-17-pro", "iPhone 17 Pro", "assets/iphone_17/iPhone_17_Pro", G.i17pro, [
    ["silver", "Silver", "17_pro_silver.png"],
    ["deep-blue", "Deep Blue", "17_pro_deep_blue.png"],
    ["cosmic-orange", "Cosmic Orange", "17_pro_cosmic_orange.png"],
  ]),
  ...build("iphone-17-pro-max", "iPhone 17 Pro Max", "assets/iphone_17/iPhone_17_Pro_Max", G.i17proMax, [
    ["silver", "Silver", "17_pro_max_silver.png"],
    ["deep-blue", "Deep Blue", "17_pro_max_deep_blue.png"],
    ["cosmic-orange", "Cosmic Orange", "17_pro_max_cosmic_orange.png"],
  ]),
  ...build("iphone-air", "iPhone Air", "assets/iphone_air", G.air, [
    ["space-black", "Space Black", "air_space_black.png"],
    ["cloud-white", "Cloud White", "air_cloud_white.png"],
    ["light-gold", "Light Gold", "air_light_gold.png"],
    ["sky-blue", "Sky Blue", "air_sky_blue.png"],
  ]),
  ...build("iphone-16", "iPhone 16", "assets/iphone_16/iPhone_16", G.i16, [
    ["black", "Black", "16_black.png"],
    ["white", "White", "16_white.png"],
    ["pink", "Pink", "16_pink.png"],
    ["teal", "Teal", "16_teal.png"],
    ["ultramarine", "Ultra Marine", "16_ultramarine.png"],
  ]),
  ...build("iphone-16-plus", "iPhone 16 Plus", "assets/iphone_16/iPhone_16_Plus", G.i16plus, [
    ["black", "Black", "16_plus_black.png"],
    ["white", "White", "16_plus_white.png"],
    ["pink", "Pink", "16_plus_pink.png"],
    ["teal", "Teal", "16_plus_teal.png"],
    ["ultramarine", "Ultra Marine", "16_plus_ultramarine.png"],
  ]),
  ...build("iphone-16-pro", "iPhone 16 Pro", "assets/iphone_16/iPhone_16_Pro", G.i16pro, [
    ["black-titanium", "Black Titanium", "16_pro_black_titanium.png"],
    ["white-titanium", "White Titanium", "16_pro_white_titanium.png"],
    ["desert-titanium", "Desert Titanium", "16_pro_desert_titanium.png"],
    ["natural-titanium", "Natural Titanium", "16_pro_natural_titanium.png"],
  ]),
  ...build("iphone-16-pro-max", "iPhone 16 Pro Max", "assets/iphone_16/iPhone_16_Pro_Max", G.i16proMax, [
    ["black-titanium", "Black Titanium", "16_pro_max_black_titanium.png"],
    ["white-titanium", "White Titanium", "16_pro_max_white_titanium.png"],
    ["desert-titanium", "Desert Titanium", "16_pro_max_desert_titanium.png"],
    ["natural-titanium", "Natural Titanium", "16_pro_max_natural_titanium.png"],
  ]),
];

export const AppState = {
  currentSelectedMockup: null,
  setCurrentSelectedMockup(mockup) {
    this.currentSelectedMockup = mockup;
  },
};
