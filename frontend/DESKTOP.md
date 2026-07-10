# Desktop App

This frontend can be packaged as a Windows desktop app with Electron.

## Development

Run Vite first:

```bash
npm run dev
```

Then open the desktop shell:

```bash
npm run desktop:dev
```

## Build Windows App

Create the production installer:

```bash
npm run desktop:build
```

Output files:

- `release/Joton-Setup-1.0.0.exe` - installer for normal use
- `release/win-unpacked/Joton.exe` - unpacked executable for quick local testing

The desktop app uses the production API configured in `src/api/invoices.js`.
