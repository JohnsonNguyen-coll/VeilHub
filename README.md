# VeilHub

VeilHub is an independent Ethereum Sepolia marketplace for official Squeek NFTs. It has an NFT rental registry, fixed-price SQK trading, a read-only portfolio, a staking scenario calculator and a mining scenario lab. The frontend is Next.js with wagmi, viem and RainbowKit. VeilHub is not an official Squeekchain product and has no mainnet deployment.

## Project structure

- `contract/`: Solidity contracts, Foundry tests, deployment scripts and Sepolia deployment records.
- `frontend/`: Next.js application, pages and assets. Set the Vercel Root Directory to `frontend`.
- `README.md`: architecture, deployment and limitations.

## Current Sepolia deployment

Squeekchain official release: [`core-sepolia-20261103`, revision 7](https://docs.squeekchain.com/assets/deployments/sepolia.json). Chain ID `11155111`.

| Contract | Address |
| --- | --- |
| Official Squeek NFT | [`0xC4C7982657f00509548F3a3a41db7FA439a6856B`](https://eth-sepolia.blockscout.com/address/0xC4C7982657f00509548F3a3a41db7FA439a6856B) |
| Official SQK | [`0xd78a3956cF63164d1Fa1C622ad3c66623162Fa1e`](https://eth-sepolia.blockscout.com/address/0xd78a3956cF63164d1Fa1C622ad3c66623162Fa1e) |
| Official Staking | [`0x50fd1780526c3186a0c037c7622203bc4fb611ca`](https://eth-sepolia.blockscout.com/address/0x50fd1780526c3186a0c037c7622203bc4fb611ca) |
| Official Mining | [`0x2dccb11fcc2defdd188555e45acb52231e82e218`](https://eth-sepolia.blockscout.com/address/0x2dccb11fcc2defdd188555e45acb52231e82e218) |
| VeilHub rental | [`0x21b0f406C5cbB106f030dD64f5A8d3881f87021F`](https://eth-sepolia.blockscout.com/address/0x21b0f406C5cbB106f030dD64f5A8d3881f87021F) |
| VeilHub trade | [`0xFaD6A6d18cf776F066EeCc6D165b717f7C860658`](https://eth-sepolia.blockscout.com/address/0xFaD6A6d18cf776F066EeCc6D165b717f7C860658) |

Rental deployment: [transaction](https://eth-sepolia.blockscout.com/tx/0x326a4fa0488d7b90b04acd21d6cf608a2d02fdca8d3f2f1b84e6d4f237a75eba), block `12070627`. Trade deployment: [transaction](https://eth-sepolia.blockscout.com/tx/0x6dc2dcffe9cf9aba5231857410e31ef20b32c538e70d0ed796c22e824ad8454b), block `12070630`. Both contracts were verified by reading their `nft()`, `sqk()` and `owner()` bindings after two confirmations. This is contract binding verification, not a public source-code verification or external audit.

The previous VeilHub rental (`0x43A8B02a3abc4d6C1d373FAE8385f618BC4f3bc3`) and trade (`0x6b10521952b8f91a896fc7e9b9bdd5ed283eea63`) contracts bind to Squeekchain's *older* Sepolia NFT and SQK. Their records remain in `contract/deployments/*-legacy-20261103.json`. Existing assets or balances in those contracts do **not** migrate automatically; the current app points to the new deployment only. Previous participants must use the old contracts to withdraw or claim.

## Rental architecture

A holder approves an official Squeek and calls `list(tokenId, pricePerDay, minDays, maxDays)`. The contract receives it via `safeTransferFrom`. On-chain `ownerOf` becomes the rental escrow contract; the original depositor has the withdrawal entitlement. The renter pays `pricePerDay × daysCount` in official SQK up front. A listing nonce and maximum payment amount protect against changed terms. One listing permits one rental; there is no early termination or refund.

`isUsable(tokenId, account)` is true only for the renter before `expiresAt`; it becomes false at expiry without a transaction. After expiry, the depositor calls `withdraw(tokenId)` to reclaim the NFT. `delist` and `withdraw` are blocked during an active rental.

Default revenue split is 95% depositor / 5% protocol. The fee is captured when listed and capped at 10% by the contract. Both recipients receive accounting credits and call `claim()` to transfer their own SQK. The contract checks exact SQK received and uses OpenZeppelin SafeERC20, ReentrancyGuard and Ownable2Step. Admin can pause *new* listings and rentals and change future fees, but cannot seize escrowed NFTs or user earnings. Claims, idle delists and eligible withdrawals stay available during a pause.

**Compatibility limit:** Squeekchain's official Staking does not read VeilHub's usage registry. A renter gains no official staking rights or rewards. An NFT in VeilHub escrow also cannot be deposited into official Staking until withdrawn. No external game or staking integration is claimed to recognize `isUsable` today. The NFT has no ERC-4907 user role. VeilHub does not share or claim official staking rewards.

## Trade and staking views

`SqueekTrade` is a separate fixed-price sale escrow. Seller approves and lists an NFT; buyer approves SQK and calls `buy(tokenId, maxPrice, expectedNonce)`. The contract checks the current quote, receives exact SQK, credits seller and the ERC-2981 royalty receiver, and transfers the NFT atomically. Each recipient uses `claim()`. There is no VeilHub trade fee. Sellers can cancel unsold listings, including during a pause. An NFT listed for sale cannot be staked until removed or bought. Rewards earned in official Staking belong to the depositor account and do not travel with a transferred NFT.

`/app/staking/` reads live power parameters, level weights, total staked SQK and connected-wallet staking balances from the [official Sepolia Staking contract](https://docs.squeekchain.com/rewards/staking/). The calculator applies the deployed power formula to editable holdings. **Reward amounts remain estimates** because future issuance, completed blocks and other participants' power are editable assumptions. VeilHub does not send official staking transactions; use the [Squeekchain account](https://sepolia.squeekchain.com/account) to deposit, withdraw or claim.

`/app/mining/` models Squeekchain mining with the official integer rule. It reads SqueekCore `state()`, SqueekMining `state()` / `issuanceSchedule()` and SqueekStaking `rewardState()` at one Sepolia block when the RPC is available; otherwise the scenario uses the published release `core-sepolia-20261103`, revision 7 values. A separate on-chain pipeline shows settled work, completed blocks, funded blocks, SQK received by Staking and the certified-round gap past Mining’s checkpoint cursor; a connected wallet can also see its claimable official Staking SQK. The pipeline never substitutes estimates when an RPC read fails. Visitors adjust accepted work per ten-minute round and the number of rounds. The simulator prices each round at its previous difficulty, then steers difficulty when work is at least 40; it carries unfinished block units forward and applies the deployed bonus and three-period halving schedule to estimate future SQK sent to Staking. Inputs describe hypothetical work: VeilHub cannot create physical work, issue SQK, pay the visitor or predict the hamster's future activity. If official Mining is not active, the SQK output assumes a hypothetical reward start. See the [SqueekCore rule](https://docs.squeekchain.com/developers/core/) and [SqueekMining schedule](https://docs.squeekchain.com/developers/mining/).

`/app/portfolio/` discovers wallet-held NFTs from official transfer events and verifies `ownerOf`; it also reads registered official staking deposits and VeilHub rental/trade positions on-chain. It displays wallet SQK, staked SQK, power and claimable staking SQK. The [official Sepolia test claim](https://sepolia.squeekchain.com/mint) may supply a test Squeek to eligible wallets; eligibility is determined by Squeekchain after connecting. VeilHub does not mint or faucet NFTs or SQK. Sepolia ETH is still needed for gas.

## Pixel World and Wheel Circuit

`/app/arcade/` is a browser-only pixel world. Move a Squeek with arrow keys, WASD or touch controls, visit the Wheelhouse, Staking Grove, Rental Burrow and Trade Market, and interact with glowing markers using E. The map links to the actual VeilHub rental and trade pages and the separate staking calculator. Discoveries are saved in this browser. Each of the four districts adds an Arcade Passport stamp and 50 local explorer points; finding all four adds a 200 point bonus. Discovered districts unlock fast travel from the map sidebar. These points have no SQK value. The Wheelhouse opens Wheel Circuit at `/app/arcade/wheel/`, where work pulses and a virtual power badge affect arcade points only. The world and game do not award SQK, stake assets or submit wallet transactions.

## Local development

Requirements: Node 22+, npm. Contract code uses Solidity 0.8.30, OpenZeppelin v5 and Foundry.

```powershell
npm --prefix contract ci
npm --prefix frontend ci
npm --prefix contract test
npm --prefix frontend run build
npm --prefix frontend run dev
```

Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `frontend/.env.local` for WalletConnect; an injected browser wallet can connect without it. `NEXT_PUBLIC_SEPOLIA_RPC_URL` can override the default Sepolia RPC. These are public configuration values; never put a private key in the frontend.

## Deploy to Sepolia

Fill `PRIVATE_KEY` and `SEPOLIA_RPC_URL` in `contract/.env` with testnet-only credentials. `PROTOCOL_TREASURY` optionally sets the rental fee recipient; otherwise it is the deployer. The script checks chain ID, official dependency code and SQK decimals, estimates gas, records transaction hashes for receipt recovery, waits for two confirmations and verifies immutable bindings. It preserves older deployment records before writing the active frontend records. The current release is already deployed, so rerunning it verifies the existing addresses without deploying duplicates.

```powershell
npm --prefix contract test
npm --prefix contract run build:contracts
node contract/script/deploy-current.mjs --check
npm --prefix contract run deploy:sepolia
npm --prefix frontend run build
```

Publish with Vercel Root Directory `frontend`. Commit and push the updated frontend deployment records before redeploying the Vercel site. The deploy script does not commit, push or publish the website.

## Validation and limitations

27 Foundry tests pass, including fee math, active rental and withdrawal rules, claims, pause behavior, reentrancy attempts, trade royalties and fuzzing. The Next.js static production build passes. Live Sepolia reads confirmed the official NFT/SQK contracts exist, `tokenURI` uses base64 JSON metadata, ERC-2981 royalties work, and Staking reports the published power parameters. No end-to-end public rental or purchase with real Squeek/SQK assets has been performed in this verification. The contracts have not received an external audit.
