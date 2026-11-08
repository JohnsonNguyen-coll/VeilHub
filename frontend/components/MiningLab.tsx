'use client';

import {useState} from 'react';
import Link from 'next/link';
import {useQuery} from '@tanstack/react-query';
import {useAccount} from 'wagmi';
import {formatUnits, parseAbi} from 'viem';
import {ArrowRight, ArrowUpRight, CircleHelp, RotateCcw, RefreshCw, Zap} from 'lucide-react';
import AppShell from './AppShell';
import {client, CORE, MINING, STAKING, stakingAbi, explorer} from '../lib/chain';
import {PUBLISHED_SCHEDULE, simulateMining, type IssuanceSchedule} from '../lib/mining-model';
import './mining-lab.css';

const coreAbi = parseAbi([
  'function state() view returns ((uint64 settledThroughRound,uint64 cumulativeWork,uint96 cumulativeBlockUnits,uint64 blockHeight,uint96 blockProgress,uint32 workPerThousandBlocks,uint256 authorizationNonce,bool paused))',
]);
const miningAbi = parseAbi([
  'function state() view returns ((uint256 minted,uint64 processedThroughRound,uint64 startRound,uint64 startHeight,uint64 fundedBlocks,address guardian,bool bootstrapped,bool startCaptured,bool paused,bool active))',
  'function issuanceSchedule() view returns ((uint256 allowance,uint256 launchBonus,uint64 bonusBlocks,uint64 halvingBlocks,uint256 firstPeriodRate,uint64 startHeight))',
]);
const fmt = (n: number | bigint) => Number(n).toLocaleString('en-US', {maximumFractionDigits: 2});
const sqk = (base: bigint) => Number(formatUnits(base, 18)).toLocaleString('en-US', {maximumFractionDigits: 2});
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? Math.floor(value) : min));

export default function MiningLab() {
  const {address} = useAccount();
  const [work, setWork] = useState(80);
  const [rounds, setRounds] = useState(12);
  const [manualDifficulty, setManualDifficulty] = useState(10875);
  const [useLive, setUseLive] = useState(true);
  const live = useQuery({queryKey: ['mining-lab-sepolia-v2', address], refetchInterval: 60_000, queryFn: async () => {
    const block = await client.getBlockNumber();
    const [core, mining, schedule, rewards, claimable] = await Promise.all([
      client.readContract({address: CORE, abi: coreAbi, functionName: 'state', blockNumber: block}),
      client.readContract({address: MINING, abi: miningAbi, functionName: 'state', blockNumber: block}),
      client.readContract({address: MINING, abi: miningAbi, functionName: 'issuanceSchedule', blockNumber: block}),
      client.readContract({address: STAKING, abi: stakingAbi, functionName: 'rewardState', blockNumber: block}),
      address ? client.readContract({address: STAKING, abi: stakingAbi, functionName: 'claimable', args: [address], blockNumber: block}) : Promise.resolve(null),
    ]);
    return {block, core, mining, schedule, rewards, claimable};
  }});
  const sourced = useLive && !!live.data;
  const schedule: IssuanceSchedule = sourced ? live.data!.schedule : PUBLISHED_SCHEDULE;
  const core = sourced ? live.data!.core : null;
  const mining = sourced ? live.data!.mining : null;
  const startHeight = core && mining?.startCaptured
    ? (core.blockHeight > mining.startHeight ? core.blockHeight - mining.startHeight : 0n)
    : 0n;
  const result = simulateMining({workPerRound: work, rounds,
    difficulty: BigInt(core?.workPerThousandBlocks ?? manualDifficulty),
    blockUnits: core?.cumulativeBlockUnits ?? 0n,
    blocksSinceStart: startHeight, schedule});
  const maxBlocks = Math.max(1, ...result.history.map(row => Number(row.blocks)));
  const samples = result.history.length <= 24 ? result.history : result.history.filter((_, i) => i % Math.ceil(result.history.length / 24) === 0 || i === result.history.length - 1);
  const runState = mining?.active ? 'MINING ACTIVE' : sourced ? 'REWARDS NOT ACTIVE' : 'PUBLISHED TESTNET VALUES';
  const snapshot = live.data;
  const lag = snapshot && snapshot.mining.startCaptured && snapshot.core.settledThroughRound > snapshot.mining.processedThroughRound
    ? snapshot.core.settledThroughRound - snapshot.mining.processedThroughRound : 0n;
  return <AppShell active="mining">
    <header className="mining-head"><div><span className="eyebrow">VEILHUB / MINING LAB</span><h1>What if the <em>wheel turns?</em></h1><p>Explore how measured work becomes Squeek blocks and how those blocks may fund SQK staking. The model follows Squeekchain’s integer rules; your inputs describe a hypothetical future.</p></div><div className="mining-status"><span className="pixel-live"/> {runState}<small>{sourced ? `Sepolia snapshot · ETH block ${fmt(live.data!.block)}` : live.isPending ? 'Reading Sepolia…' : 'On-chain read unavailable · using published revision 7 values'}</small></div></header>
    <section className="mining-pipeline" aria-label="Live Squeekchain pipeline"><div className="mining-pipeline-heading"><div><span className="eyebrow">LIVE / SEPOLIA</span><h2>From wheel record to staking</h2><p>One Ethereum block snapshot. These totals are recorded by the official contracts; the scenario below is separate.</p></div><button onClick={() => live.refetch()} disabled={live.isFetching}><RefreshCw size={15} className={live.isFetching ? 'mining-refreshing' : ''}/> Refresh <span>{snapshot ? `#${fmt(snapshot.block)}` : 'RPC'}</span></button></div>
      {snapshot ? <><div className="mining-pipeline-steps"><div><span className="mining-step-number">01 / CORE</span><small>SETTLED WORK</small><strong>{fmt(snapshot.core.cumulativeWork)}</strong><p>Accepted passages settled through round {fmt(snapshot.core.settledThroughRound)}.</p></div><div><span className="mining-step-number">02 / CORE</span><small>SQUEEK BLOCKS</small><strong>{fmt(snapshot.core.blockHeight)}</strong><p>{(Number(snapshot.core.blockProgress) / 10_000_000).toFixed(1)}% toward the next block.</p></div><div><span className="mining-step-number">03 / MINING</span><small>FUNDED BLOCKS</small><strong>{fmt(snapshot.mining.fundedBlocks)}</strong><p>{snapshot.mining.startCaptured ? `${fmt(lag)} certified rounds past the checkpoint cursor.` : 'Start height has not been captured yet.'}</p></div><div><span className="mining-step-number">04 / STAKING</span><small>SQK FUNDED</small><strong>{sqk(snapshot.rewards.funded)}</strong><p>Mining issued {sqk(snapshot.mining.minted)} SQK since reward start.</p></div></div><div className="mining-pipeline-foot"><span>Core work and blocks include history before SQK rewards started. Funded blocks and SQK begin at Mining’s start height. A checkpoint can advance with zero new SQK.</span>{address&&<span><b>YOUR CLAIMABLE STAKING SQK</b> {snapshot.claimable===null?'—':sqk(snapshot.claimable)}</span>}</div></> : <div className="mining-pipeline-empty" role={live.isError?'alert':'status'}>{live.isPending?'Reading official Sepolia contracts…':'On-chain data is unavailable right now. The scenario below still works with published testnet parameters.'}</div>}
    </section>
    <div className="mining-layout"><section className="mining-console" aria-label="Mining scenario controls">
      <div className="mining-panel-top"><span>01 / SCENARIO ENGINE</span><button onClick={() => {setWork(80);setRounds(12);setManualDifficulty(10875);setUseLive(true)}}><RotateCcw size={14}/> Reset</button></div>
      <div className="mining-wheel-scene"><div className="mining-wheel" style={{animationDuration: `${Math.max(.8, 8 - work / 160)}s`}}><span>✦</span><i/><i/><i/><i/></div><div className="mining-scene-label"><b>WHEELY9000</b><span>ROUND INPUT / ESTIMATE</span></div><div className="mining-pulse"><Zap size={15}/> {fmt(work)} accepted passages</div></div>
      <div className="mining-presets" aria-label="Work presets"><span>TRY A PACE</span>{[{label:'Quiet',value:12},{label:'Steady',value:80},{label:'Sprint',value:320}].map(p=><button key={p.label} className={work===p.value?'selected':''} onClick={()=>setWork(p.value)}>{p.label}</button>)}</div>
      <label className="mining-input"><span><b>Accepted work per 10-minute round</b><strong>{fmt(work)}</strong></span><input type="range" min="0" max="1000" step="1" value={work} onChange={e=>setWork(clamp(Number(e.target.value),0,1000))}/><small>Physical work is recorded only by Squeekchain’s WHEELY9000. This slider invents no work.</small></label>
      <div className="mining-fields"><label className="mining-input"><span><b>Number of rounds</b></span><input type="number" min="1" max="144" value={rounds} onChange={e=>setRounds(clamp(Number(e.target.value),1,144))}/><small>1–144 rounds · 10 minutes each</small></label><label className="mining-input"><span><b>Starting difficulty</b></span><input type="number" min="1000" max="1000000000" disabled={sourced} value={core?.workPerThousandBlocks ?? manualDifficulty} onChange={e=>setManualDifficulty(clamp(Number(e.target.value),1000,1_000_000_000))}/><small>{sourced?'Read from SqueekCore.state()':'Editable from the published 10,875 start'}</small></label></div>
      <div className="mining-source"><div><strong>Start from on-chain position</strong><small>Read Core progress and Mining schedule at one Sepolia block.</small></div><button role="switch" aria-checked={useLive} aria-label="Use live Sepolia position" className={useLive?'on':''} onClick={()=>setUseLive(v=>!v)}><span/></button></div>
      <p className="mining-source-note">{sourced?'Live data supplies the starting point only. Future work remains hypothetical.': 'Using published Sepolia revision 7 parameters and a fresh zero-progress scenario.'}</p>
    </section><section className="mining-results" aria-label="Estimated mining results"><div className="mining-panel-top"><span>02 / PROJECTED OUTCOME</span><b>ESTIMATE</b></div><div className="mining-result-grid"><div><small>SQUEEK BLOCKS COMPLETED</small><strong>{fmt(result.blocks)}</strong><span>In {result.minutes / 60} scenario hours</span></div><div><small>FUTURE SQK TO STAKING</small><strong>{sqk(result.issued)}</strong><span>SQK scheduled, not wallet earnings</span></div><div><small>NEXT ROUND DIFFICULTY</small><strong>{fmt(result.finalDifficulty)}</strong><span>Work per 1,000 blocks</span></div><div><small>UNFINISHED BLOCK</small><strong>{(Number(result.finalProgress) / 10_000_000).toFixed(1)}%</strong><span>Progress carried forward</span></div></div>
      <div className="mining-chart-head"><div><strong>Blocks by round</strong><small>Each bar uses the difficulty set by earlier rounds</small></div><span>{fmt(result.workTotal)} work total</span></div><div className="mining-chart" role="img" aria-label={`Estimated completed Squeek blocks by round: ${result.history.map(row=>row.blocks.toString()).join(', ')}`}>{samples.map(row=><div key={row.round} title={`Round ${row.round}: ${row.blocks} blocks · difficulty ${row.difficulty}`}><span style={{height:`${Math.max(4,Number(row.blocks)/maxBlocks*100)}%`}}/><small>{row.round}</small></div>)}</div>
      <div className="mining-rule"><strong>Exact round rule</strong><code>U += floor(w × 10¹² / D)</code><code>D&apos; = floor((29D + floor(w × 1000 / 40)) / 30), if w ≥ 40</code><p>One billion block units complete one Squeek block. SQK issuance follows the deployed bonus and halving schedule; checkpoints transfer it to Staking, where accounts earn by power.</p></div>
    </section></div>
    <div className="mining-links"><div><CircleHelp size={18}/><p><b>What this predicts</b><br/>The output is a mathematical scenario, not a record of future hamster activity, a wallet balance or a claimable reward. If Mining has not started, the SQK figure assumes a hypothetical start. Actual funding also requires certified rounds and a checkpoint.</p></div><div><a href="https://docs.squeekchain.com/whitepaper/" target="_blank" rel="noreferrer">Official whitepaper <ArrowUpRight size={14}/></a><Link href="/app/staking/">Explore your staking share <ArrowRight size={14}/></Link><a href={explorer(CORE)} target="_blank" rel="noreferrer">Inspect SqueekCore <ArrowUpRight size={14}/></a><a href={explorer(MINING)} target="_blank" rel="noreferrer">Inspect SqueekMining <ArrowUpRight size={14}/></a></div></div>
  </AppShell>;
}
