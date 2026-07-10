# Coin Flip

The simplest, best coin flip for iOS. One coin. Tap to flip. That's it.

- Beautiful gold coin with a real 3D flip, haptics, and a satisfying ring
- Fair flips — cryptographically random (`expo-crypto`), exactly 50/50
- Heads/tails tally, kept on your device (long-press to reset)
- 100% free. No ads, no account, no tracking, no network. Works offline, forever.

## Support

Something wrong? Open an issue: https://github.com/keyfive5/CoinFlip/issues

## Privacy

No data collected, at all. See [PRIVACY.md](PRIVACY.md).

## Tech

Expo (React Native) + TypeScript. Coin faces are hand-drawn SVG (`react-native-svg`),
sounds are synthesized WAVs (`scripts/make-sounds.mjs`), icon generated from SVG
(`scripts/make-icons.mjs`).
