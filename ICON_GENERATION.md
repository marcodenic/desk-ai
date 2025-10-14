# Desk AI Icon Design

I've created two SVG icon designs for Desk AI:

## Design 1: `icon-design.svg` (Hexagon Accent)
- Features a subtle hexagon shape in the background
- Bold "DAI" text with green underline accent
- Matches the app's dark theme with green accent colors

## Design 2: `icon-design-minimal.svg` (Minimal Frame)
- Cleaner, simpler design
- Green rounded rectangle frame
- Small green accent dot
- More minimal and modern

## How to Generate Icon Files

You'll need to convert these SVGs to PNG/ICO/ICNS formats. Here are the steps:

### Option 1: Using ImageMagick (Linux/Mac)

```bash
# Install ImageMagick if you don't have it
sudo apt install imagemagick  # Ubuntu/Debian
brew install imagemagick      # macOS

# Convert SVG to various PNG sizes
convert icon-design.svg -resize 32x32 src-tauri/icons/32x32.png
convert icon-design.svg -resize 128x128 src-tauri/icons/128x128.png
convert icon-design.svg -resize 256x256 src-tauri/icons/128x128@2x.png
convert icon-design.svg -resize 512x512 src-tauri/icons/icon.png
convert icon-design.svg -resize 1024x1024 src-tauri/icons/icon@2x.png
convert icon-design.svg -resize 310x310 src-tauri/icons/Square310x310Logo.png

# For ICO (Windows)
convert icon-design.svg -define icon:auto-resize=256,128,64,48,32,16 src-tauri/icons/icon.ico

# For ICNS (macOS) - requires png2icns
png2icns src-tauri/icons/icon.icns src-tauri/icons/icon.png
```

### Option 2: Using Inkscape (Cross-platform)

```bash
# Install Inkscape
sudo apt install inkscape  # Ubuntu/Debian
brew install inkscape      # macOS

# Export to PNG
inkscape icon-design.svg --export-filename=src-tauri/icons/32x32.png --export-width=32 --export-height=32
inkscape icon-design.svg --export-filename=src-tauri/icons/128x128.png --export-width=128 --export-height=128
inkscape icon-design.svg --export-filename=src-tauri/icons/icon.png --export-width=512 --export-height=512
# ... repeat for other sizes
```

### Option 3: Online Tools

Use online converters like:
- https://www.aconvert.com/icon/svg-to-ico/ (for ICO)
- https://cloudconvert.com/svg-to-png (for PNG)
- https://anyconv.com/svg-to-icns-converter/ (for ICNS)

## Recommended Workflow

1. Choose which design you prefer (`icon-design.svg` or `icon-design-minimal.svg`)
2. Open it in Inkscape or another SVG editor to preview
3. Adjust colors if needed (the green is currently #10b981, matching your app)
4. Export to all required sizes
5. Replace files in `src-tauri/icons/`
6. Rebuild the app with `npm run tauri build`

## Quick Script

I've also created a bash script to automate this (requires ImageMagick):

```bash
#!/bin/bash
# Choose your design
ICON="icon-design.svg"

cd "$(dirname "$0")"
convert "$ICON" -resize 32x32 src-tauri/icons/32x32.png
convert "$ICON" -resize 128x128 src-tauri/icons/128x128.png
convert "$ICON" -resize 256x256 src-tauri/icons/128x128@2x.png
convert "$ICON" -resize 512x512 src-tauri/icons/icon.png
convert "$ICON" -resize 1024x1024 src-tauri/icons/icon@2x.png
convert "$ICON" -resize 310x310 src-tauri/icons/Square310x310Logo.png
convert "$ICON" -define icon:auto-resize=256,128,64,48,32,16 src-tauri/icons/icon.ico

echo "Icons generated! Now build the app with: npm run tauri build"
```

Save this as `generate-icons.sh`, make it executable with `chmod +x generate-icons.sh`, and run it.

## Color Customization

The current green accent color is `#10b981` (matching your app's theme). If you want to adjust:

- Primary green: `#10b981`
- Darker green: `#059669`
- Background: `#0f0f0f`
- Text: `#ffffff`

Edit the SVG file to change these values.
