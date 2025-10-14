#!/bin/bash
# Generate all required icon formats from the bolt SVG design

ICON="icon-bolt.svg"

if [ ! -f "$ICON" ]; then
    echo "Error: $ICON not found!"
    exit 1
fi

echo "Generating icons from $ICON..."

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "Error: ImageMagick not found!"
    echo "Install it with: sudo apt install imagemagick"
    exit 1
fi

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
ICONS_DIR="$PROJECT_ROOT/src-tauri/icons"

# Create icons directory if it doesn't exist
mkdir -p "$ICONS_DIR"

# Generate PNG files
echo "Generating PNG files..."
convert "$ICON" -background none -alpha on -resize 32x32 PNG32:"$ICONS_DIR/32x32.png"
convert "$ICON" -background none -alpha on -resize 128x128 PNG32:"$ICONS_DIR/128x128.png"
convert "$ICON" -background none -alpha on -resize 256x256 PNG32:"$ICONS_DIR/128x128@2x.png"
convert "$ICON" -background none -alpha on -resize 512x512 PNG32:"$ICONS_DIR/icon.png"
convert "$ICON" -background none -alpha on -resize 1024x1024 PNG32:"$ICONS_DIR/icon@2x.png"
convert "$ICON" -background none -alpha on -resize 310x310 PNG32:"$ICONS_DIR/Square310x310Logo.png"

# Ensure icons are in RGBA format (required by Tauri)
if command -v optipng &> /dev/null; then
    echo "Optimizing PNG files..."
    optipng -nc -o0 "$ICONS_DIR/32x32.png" 2>/dev/null
    optipng -nc -o0 "$ICONS_DIR/128x128.png" 2>/dev/null
    optipng -nc -o0 "$ICONS_DIR/icon.png" 2>/dev/null
fi

# Generate ICO file for Windows
echo "Generating ICO file..."
# Create temporary PNGs for ICO generation
TMP_DIR=$(mktemp -d)
for size in 16 32 48 64 128 256; do
    convert "$ICON" -background none -alpha on -resize ${size}x${size} ${TMP_DIR}/icon_${size}.png
done

# Use icotool if available (creates proper 8-bit ICO), otherwise fall back to ImageMagick
if command -v icotool &> /dev/null; then
    icotool -c -o "$ICONS_DIR/icon.ico" \
        ${TMP_DIR}/icon_16.png \
        ${TMP_DIR}/icon_32.png \
        ${TMP_DIR}/icon_48.png \
        ${TMP_DIR}/icon_64.png \
        ${TMP_DIR}/icon_128.png \
        ${TMP_DIR}/icon_256.png
    echo "✓ ICO file generated with icotool"
else
    # Fallback to ImageMagick
    convert ${TMP_DIR}/icon_16.png ${TMP_DIR}/icon_32.png ${TMP_DIR}/icon_48.png \
            ${TMP_DIR}/icon_64.png ${TMP_DIR}/icon_128.png ${TMP_DIR}/icon_256.png \
            "$ICONS_DIR/icon.ico"
    echo "⚠ ICO file generated with ImageMagick (may have bit depth issues on Windows)"
fi
rm -rf ${TMP_DIR}

# Generate ICNS file for macOS (requires png2icns or iconutil)
echo "Generating ICNS file..."
if command -v png2icns &> /dev/null; then
    png2icns "$ICONS_DIR/icon.icns" "$ICONS_DIR/icon.png"
    echo "✓ ICNS file generated with png2icns"
elif command -v iconutil &> /dev/null; then
    # macOS iconutil method
    mkdir -p icon.iconset
    for size in 16 32 128 256 512; do
        convert "$ICON" -resize ${size}x${size} icon.iconset/icon_${size}x${size}.png
        convert "$ICON" -resize $((size*2))x$((size*2)) icon.iconset/icon_${size}x${size}@2x.png
    done
    iconutil -c icns icon.iconset -o "$ICONS_DIR/icon.icns"
    rm -rf icon.iconset
    echo "✓ ICNS file generated with iconutil"
else
    echo "⚠ Warning: Neither png2icns nor iconutil found. ICNS file not generated."
    echo "  Install png2icns with: sudo apt install icnsutils"
    echo "  Or use macOS's built-in iconutil"
fi

echo ""
echo "✓ Icon generation complete!"
echo ""
echo "Generated files:"
ls -lh "$ICONS_DIR/"
echo ""
echo "Next steps:"
echo "1. Review the generated icons in src-tauri/icons/"
echo "2. Rebuild the app with: npm run tauri dev"
echo "3. Check the system tray icon and window icon"
