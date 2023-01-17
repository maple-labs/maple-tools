## maple-tools

### Install

Install globally to use with `npx`.

### Generate Merged ABIs

```console
npx maple-tools merge-abi --in path/to/out --out path/to/write/artifacts --name "MapleLoan" --filter "MapleLoan" --filter "IMapleLoan" --filter="IMapleLoanEvents"  --filter "MapleLoanStorage" --filter "MapleProxiedInternals" --filter "IMapleProxied" --filter "ProxiedInternals" --filter "IProxied" -filter "SlotManipulatable"
```

or

```console
node ./bin/index.js merge-abi --in ../path/to/out --out ../path/to/write/artifacts --name "MapleLoanFeeManager" --filter "MapleLoanFeeManager" --filter "IMapleLoanFeeManager
```

### Generate Docs

```console
npx maple-tools build-docs --in ./path/to/artifacts --out ./path/to/docs [--templates ./templates]
```

or

```console
node ./bin/index.js build-docs --in ../path/to/artifacts --out ../path/to/docs
```
