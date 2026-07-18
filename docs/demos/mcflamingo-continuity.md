# Demo — McFlamingo continuity (origin dark)

**Claim this unlocks:** _“Storefront artifact stays servable + PIX checkout settles after origin kill (lab).”_  
**Does not unlock:** public DNS failover, “AWS-proof internet,” or Pixel-as-hosting-provider.

## Run

```bash
bun run test:continuity
```

What it proves:

1. McFlamingo menu bytes get a digest and shine into Pixel (SISO).
2. **Origin** HTTP process is killed (AWS-down stand-in).
3. **Mirror** still serves the **same** HTML (digest match).
4. Checkout of **3 PIX** settles on a local Pixel chain while origin is dark.

Storefront file: [`public/mcflamingo/index.html`](../../public/mcflamingo/index.html)

## Human eyeball (optional)

After a passing selftest, you can serve the file yourself on two ports and stop one:

```bash
bun -e '
const html = await Bun.file("public/mcflamingo/index.html").text();
Bun.serve({ port: 4100, fetch: () => new Response(html, { headers: { "content-type": "text/html" } }) });
Bun.serve({ port: 4101, fetch: () => new Response(html, { headers: { "content-type": "text/html" } }) });
console.log("origin http://127.0.0.1:4100  mirror http://127.0.0.1:4101");
'
```

Open both URLs — same look. Kill the origin process; mirror still loads.

## Next rungs (not this demo)

- Nebius / Hetzner / paid private nodes as real mirror ladder
- DNS or gateway that fails over when origin health-checks fail
- Kindling spend from a phone against the mirrored menu
