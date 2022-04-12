## maple-tools

### Install

Install globally to use with `npx`.


### Generate Merged ABIs

```console
npx maple-tools merge-abi --in ./path/to/out/dapp.sol.json --out ./path/to/artifacts --name "MapleLoan" --filter "MapleLoan" --name "MapleLoan" --filter "MapleLoan" --filter "IMapleLoan" --filter "MapleLoanInternals" --filter "MapleProxiedInternals" --filter "IMapleProxied" --filter "IMapleLoanEvents" --filter "ProxiedInternals" --filter "ProxiedInternals" --filter "IProxied" --filter "ProxiedInternals" --filter "SlotManipulatable" --filter "SlotManipulatable"
```


### Generate Docs

```console
npx maple-tools build-docs --in ./path/to/artifacts --out ./path/to/docs [--templates ./templates]
```
