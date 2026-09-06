# Submission assets

The PNG files in this directory are generated from the deterministic mock demo and
contain synthetic account, wallet, agent, and key data.

Regenerate them with:

```bash
npm run assets:capture
```

Generate the silent MP4 demo draft with:

```bash
npm run video:record
```

Generate the synthetic narrated MP4 draft with:

```bash
npm run video:narrate
```

Generated video outputs:

- `orbio-guard-demo.mp4` - silent dashboard sequence.
- `orbio-guard-demo-narrated.mp4` - synthetic Samantha-voice narration draft.

Do not replace them with screenshots containing live secrets or complete wallet data.
