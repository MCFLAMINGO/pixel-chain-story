# Pixel Chain

Pixel Chain is a proof-of-concept blockchain where the ledger is not a list of
opaque data structures but a literal picture: every block in the chain is a
single pixel, and the chain itself is the image formed by those pixels. Each
pixel's RGB color is derived from its index, its data payload, and the hash of
the previous pixel, so the picture is both the storage medium and the integrity
check — recomputing a pixel's expected color from its data and the prior
pixel's hash proves that nothing upstream has been altered. Mining a new block
means appending one more pixel to the image; verifying the chain means walking
the pixels in order and confirming that each one's color matches what the
previous pixel's hash predicts. If anyone edits a single pixel by hand, its
color stops matching its hash, verification fails, and the tampering is
visible in the picture itself. This repository contains a minimal browser
implementation (`src/lib/pixel-chain.ts`) plus a demo page that lets you mine
new pixels, tamper with the image, and watch the chain report itself broken.
