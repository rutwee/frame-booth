// ==========================================================================
//  DEVICE DATA
// ==========================================================================
// ------------------- iPhone 17 Series -----------------
const iPhone17Data = {
    group: "iPhone 17",
    originalWidth: 1350,
    originalHeight: 2760,
    screen: {
        x: 70, y: 67, width: 1210, height: 2626, cornerRadius: 180,
        island: { x: 489, y: 113, width: 372, height: 105, cornerRadius: 52 }
    }
};

const iPhone17ProData = {
    group: "iPhone 17 Pro",
    originalWidth: 1350,
    originalHeight: 2760,
    screen: {
        x: 70, y: 67, width: 1210, height: 2626, cornerRadius: 180,
        island: { x: 489, y: 113, width: 372, height: 105, cornerRadius: 52 }
    }
};

const iPhone17ProMaxData = {
    group: "iPhone 17 Pro Max",
    originalWidth: 1470,
    originalHeight: 3000,
    screen: {
        x: 73, y: 64, width: 1324, height: 2872, cornerRadius: 180,
        island: { x: 549, y: 110, width: 372, height: 106, cornerRadius: 52 }
    }
};

// ----------------- iPhone Air -------------------
const iPhoneAirData = {
    group: "iPhone Air",
    originalWidth: 1380,
    originalHeight: 2880,
    screen: {
        x: 58, y: 70, width: 1264, height: 2740, cornerRadius: 180, 
        island: { x: 504, y: 135, width: 372, height: 105, cornerRadius: 52 }
    }
};

// ------------------ iPhone 16 Series ------------------
const iPhone16Data = {
    group: "iPhone 16",
    originalWidth: 1359, 
    originalHeight: 2736, 
    screen: {
        x: 88, y: 88, width: 1183, height: 2560, cornerRadius: 160,
        island: { x: 493, y: 124, width: 374, height: 109, cornerRadius: 52 }
    }
};

const iPhone16PlusData = {
    group: "iPhone 16 Plus",
    originalWidth: 1470, 
    originalHeight: 2970, 
    screen: {
        x: 88, y: 85, width: 1294, height: 2800, cornerRadius: 160,
        island: { x: 545, y: 123, width: 380, height: 107, cornerRadius: 53.5 }
    }
};

const iPhone16ProData = {
    group: "iPhone 16 Pro",
    originalWidth: 1350,
    originalHeight: 2760,
    screen: {
        x: 70, y: 67, width: 1210, height: 2626, cornerRadius: 180,
        island: { x: 487, y: 107, width: 376, height: 112, cornerRadius: 52 }
    }
};

const iPhone16ProMaxData = {
    group: "iPhone 16 Pro Max",
    originalWidth: 1470,
    originalHeight: 3000,
    screen: {
        x: 73, y: 64, width: 1324, height: 2872, cornerRadius: 180,
        island: { x: 548, y: 109, width: 374, height: 108, cornerRadius: 54 }
    }
};


// ==========================================================================
//  FRAMES LIST
// ==========================================================================
export const frames = [
    // --- iPhone 17 ---
    { id: "iphone-17-black",    name: "iPhone 17 Black",    src: "assets/iphone_17/iPhone_17/17_black.png",    ...iPhone17Data },
    { id: "iphone-17-white",    name: "iPhone 17 White",    src: "assets/iphone_17/iPhone_17/17_white.png",    ...iPhone17Data },
    { id: "iphone-17-lavender", name: "iPhone 17 Lavender", src: "assets/iphone_17/iPhone_17/17_lavender.png", ...iPhone17Data },
    { id: "iphone-17-mistblue", name: "iPhone 17 Mist Blue",src: "assets/iphone_17/iPhone_17/17_mistblue.png", ...iPhone17Data },
    { id: "iphone-17-sage",     name: "iPhone 17 Sage",     src: "assets/iphone_17/iPhone_17/17_sage.png",     ...iPhone17Data },

    // --- iPhone 17 Pro ---
    { id: "iphone-17-pro-silver",        name: "iPhone 17 Pro Silver",        src: "assets/iphone_17/iPhone_17_Pro/17_pro_silver.png",        ...iPhone17ProData },
    { id: "iphone-17-pro-deep-blue",     name: "iPhone 17 Pro Deep Blue",     src: "assets/iphone_17/iPhone_17_Pro/17_pro_deep_blue.png",     ...iPhone17ProData },
    { id: "iphone-17-pro-cosmic-orange", name: "iPhone 17 Pro Cosmic Orange", src: "assets/iphone_17/iPhone_17_Pro/17_pro_cosmic_orange.png", ...iPhone17ProData },

    // --- iPhone 17 Pro Max ---
    { id: "iphone-17-pro-max-silver",        name: "iPhone 17 Pro Max Silver",        src: "assets/iphone_17/iPhone_17_Pro_Max/17_pro_max_silver.png",        ...iPhone17ProMaxData },
    { id: "iphone-17-pro-max-deep-blue",     name: "iPhone 17 Pro Max Deep Blue",     src: "assets/iphone_17/iPhone_17_Pro_Max/17_pro_max_deep_blue.png",     ...iPhone17ProMaxData },
    { id: "iphone-17-pro-max-cosmic-orange", name: "iPhone 17 Pro Max Cosmic Orange", src: "assets/iphone_17/iPhone_17_Pro_Max/17_pro_max_cosmic_orange.png", ...iPhone17ProMaxData },

    // --- iPhone Air ---
    { id: "iphone-air-space-black", name: "iPhone Air Space Black", src: "assets/iphone_air/air_space_black.png", ...iPhoneAirData },
    { id: "iphone-air-cloud-white", name: "iPhone Air Cloud White", src: "assets/iphone_air/air_cloud_white.png", ...iPhoneAirData },
    { id: "iphone-air-light-gold",  name: "iPhone Air Light Gold",  src: "assets/iphone_air/air_light_gold.png",  ...iPhoneAirData },
    { id: "iphone-air-sky-blue",    name: "iPhone Air Sky Blue",    src: "assets/iphone_air/air_sky_blue.png",    ...iPhoneAirData },

    // --- iPhone 16 ---
    { id: "iphone-16-black",       name: "iPhone 16 Black",       src: "assets/iphone_16/iPhone_16/16_black.png",       ...iPhone16Data },
    { id: "iphone-16-white",       name: "iPhone 16 White",       src: "assets/iphone_16/iPhone_16/16_white.png",       ...iPhone16Data },
    { id: "iphone-16-pink",        name: "iPhone 16 Pink",        src: "assets/iphone_16/iPhone_16/16_pink.png",        ...iPhone16Data },
    { id: "iphone-16-teal",        name: "iPhone 16 Teal",        src: "assets/iphone_16/iPhone_16/16_teal.png",        ...iPhone16Data },
    { id: "iphone-16-ultramarine", name: "iPhone 16 Ultra Marine",src: "assets/iphone_16/iPhone_16/16_ultramarine.png", ...iPhone16Data },

    // --- iPhone 16 Plus ---
    { id: "iphone-16-plus-black",       name: "iPhone 16 Plus Black",       src: "assets/iphone_16/iPhone_16_Plus/16_plus_black.png",       ...iPhone16PlusData },
    { id: "iphone-16-plus-white",       name: "iPhone 16 Plus White",       src: "assets/iphone_16/iPhone_16_Plus/16_plus_white.png",       ...iPhone16PlusData },
    { id: "iphone-16-plus-pink",        name: "iPhone 16 Plus Pink",        src: "assets/iphone_16/iPhone_16_Plus/16_plus_pink.png",        ...iPhone16PlusData },
    { id: "iphone-16-plus-teal",        name: "iPhone 16 Plus Teal",        src: "assets/iphone_16/iPhone_16_Plus/16_plus_teal.png",        ...iPhone16PlusData },
    { id: "iphone-16-plus-ultramarine", name: "iPhone 16 Plus Ultra Marine",src: "assets/iphone_16/iPhone_16_Plus/16_plus_ultramarine.png", ...iPhone16PlusData },

    // --- iPhone 16 Pro ---
    { id: "iphone-16-pro-black-titanium",       name: "iPhone 16 Pro Black Titanium",       src: "assets/iphone_16/iPhone_16_Pro/16_pro_black_titanium.png",       ...iPhone16ProData },
    { id: "iphone-16-pro-white-titanium",       name: "iPhone 16 Pro White Titanium",       src: "assets/iphone_16/iPhone_16_Pro/16_pro_white_titanium.png",       ...iPhone16ProData },
    { id: "iphone-16-pro-desert-titanium",       name: "iPhone 16 Pro Desert Titanium",       src: "assets/iphone_16/iPhone_16_Pro/16_pro_desert_titanium.png",       ...iPhone16ProData },
    { id: "iphone-16-pro-natural-titanium",       name: "iPhone 16 Pro Natural Titanium",       src: "assets/iphone_16/iPhone_16_Pro/16_pro_natural_titanium.png",       ...iPhone16ProData },

    // --- iPhone 16 Pro Max ---
    { id: "iphone-16-pro-max-black-titanium",       name: "iPhone 16 Pro Max Black Titanium",       src: "assets/iphone_16/iPhone_16_Pro_Max/16_pro_max_black_titanium.png",       ...iPhone16ProMaxData },
    { id: "iphone-16-pro-max-white-titanium",       name: "iPhone 16 Pro Max White Titanium",       src: "assets/iphone_16/iPhone_16_Pro_Max/16_pro_max_white_titanium.png",       ...iPhone16ProMaxData },
    { id: "iphone-16-pro-max-desert-titanium",       name: "iPhone 16 Pro Max Desert Titanium",       src: "assets/iphone_16/iPhone_16_Pro_Max/16_pro_max_desert_titanium.png",       ...iPhone16ProMaxData },
    { id: "iphone-16-pro-max-natural-titanium",       name: "iPhone 16 Pro Max Natural Titanium",       src: "assets/iphone_16/iPhone_16_Pro_Max/16_pro_max_natural_titanium.png",       ...iPhone16ProMaxData }
];


// ==========================================================================
//  APPLICATION STATE
// ==========================================================================
export const AppState = {
    currentSelectedMockup: null,

    setCurrentSelectedMockup(mockup) {
        this.currentSelectedMockup = mockup;
    }
};
