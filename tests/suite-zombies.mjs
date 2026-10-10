/**
 * 十条改动的行为断言。
 *
 * 每条都按「钩子挂在哪、什么条件下改、什么时候还原」来验，
 * 不需要游戏本体。假类来自 harness.mjs，方法名与引擎一致。
 */
import {
  ok, near, section,
  FakeZombie, FakePlant, makeLane, callCtx, makeRefs,
} from './harness.mjs'

export function runZombies({ T, mod }) {
  // 每次跑测试前把运行期状态清干净，并注入假引擎依赖
  T.resetRuntime()
  T.setRefs(makeRefs())

  const find = (key, name) => T.TARGETS.find((t) => t.key === key && (!name || t.names[0] === name))

  // ─────────────────────── 配置与挂载表 ───────────────────────

  section('0. 配置与挂载表')

  ok(T.CFG.breakdancerKickSelfHit === 50, '霹雳舞自扣 = 50', String(T.CFG.breakdancerKickSelfHit))
  ok(T.CFG.octopusThrowSelfHit === 150, '章鱼自扣 = 150', String(T.CFG.octopusThrowSelfHit))
  ok(T.CFG.jesterRotateSelfHitPerSec === 20, '弄臣旋转 = 20/秒（1.0.1 由 30 下调）', String(T.CFG.jesterRotateSelfHitPerSec))
  ok(T.CFG.burnDPS === 1000, '焚烧 DPS = 1000（对齐沙漠探险家）', String(T.CFG.burnDPS))
  ok(T.CFG.explosionDamage === 1800, '自爆伤害 = 1800', String(T.CFG.explosionDamage))
  ok(T.CFG.explodeRangeSquares === 2, '自爆范围 = 2 格（半径 1 格）', String(T.CFG.explodeRangeSquares))
  ok(T.CFG.arcadeSummonSelfHit > 0, '街机召唤自扣为正数')

  ok(T.TARGETS.length === 11, '挂载表 11 条（9 个类 + 未来三只拆 3 条）', String(T.TARGETS.length))
  ok(T.TARGETS.every((t) => t.names && t.names.length && (t.methods || t.method)), '每条都有类名与方法名')
  const bombEntries = T.TARGETS.filter((t) => t.mode === 'bomb')
  ok(bombEntries.length === 3, '未来三只各占一条', String(bombEntries.length))
  ok(bombEntries.every((t) => t.methods.length === 3), '未来三只各挂 3 个死亡入口')
  ok(bombEntries.every((t) => t.methods.includes('playDie') && t.methods.includes('judgeDeath') && t.methods.includes('onDamagedToHealth0')),
    '三个死亡入口名称正确')

  // ─────────────────────── 2. 重金属巨人 ───────────────────────

  section('2. 重金属巨人 · 移除音波 AOE')

  {
    const entry = find('gargantuarAoe')
    const z = new FakeZombie()
    const { ctx, calls } = callCtx(z)
    const r = T.handlerBlock(entry, z, [{ name: 'smash' }], ctx.callNext)
    ok(r === undefined, '拦截后返回 undefined（不吃掉原实现的返回值）')
    ok(calls.length === 0, '没有调用 callNext，音波不会射出')
    ok(T.stats.blocked === 1, '拦截计数 +1', String(T.stats.blocked))
  }

  // ─────────────────────── 3. 街机游戏机 ───────────────────────

  section('3. 街机 · 摘掉像素铁桶 + 召唤自扣')

  {
    const entry = find('arcadeSummon')
    const z = new FakeZombie({
      summonCD: 0.01,
      objdataOwn: {
        SummonnedZombies: [
          { Type: 'eighties_8bit' },
          { Type: 'eighties_8bit_armor1' },
          { Type: 'eighties_8bit_armor2' },
        ],
      },
    })
    const { ctx } = callCtx(z, [0.02])
    // 模拟引擎：本帧 CD 耗尽 → 召唤 → CD 重置为新的随机值
    ctx.callNext = () => { z.summonCD = 5; return 'NEXT' }
    T.handlerArcade(entry, z, [0.02], ctx.callNext)

    const pool = z.objdataOwn.SummonnedZombies.map((e) => e.Type)
    ok(!pool.includes('eighties_8bit_armor2'), '召唤池已摘掉像素铁桶', pool.join(','))
    ok(pool.length === 2, '其余两项保留', pool.join(','))
    ok(z.damageTaken.length === 1 && z.damageTaken[0] === T.CFG.arcadeSummonSelfHit,
      '召唤发生时自身扣血', JSON.stringify(z.damageTaken))
    ok(T.stats.arcadeSummons === 1, '召唤计数 +1')

    // 没到召唤点就不该扣血
    const z2 = new FakeZombie({ summonCD: 3, objdataOwn: { SummonnedZombies: [] } })
    const c2 = callCtx(z2, [0.02])
    c2.ctx.callNext = () => { z2.summonCD = 2.98; return 'NEXT' }
    T.handlerArcade(entry, z2, [0.02], c2.ctx.callNext)
    ok(z2.damageTaken.length === 0, 'CD 未耗尽时不扣血', JSON.stringify(z2.damageTaken))
  }

  // ─────────────────────── 4. 轮滑僵尸 ───────────────────────

  section('4. 轮滑（闪耀）· 地刺一击必杀')

  {
    const entry = find('glitterSpike')
    const z = new FakeZombie()
    const smashed = []
    const spikes = [{ normalSmash: (target) => smashed.push(target) }, { normalSmash: (target) => smashed.push(target) }]
    const { ctx, calls } = callCtx(z, [spikes])
    const r = T.handlerSpike(entry, z, [spikes], ctx.callNext)
    ok(z.playDieCalls === 1, '调用了 playDie（一击必杀）')
    ok(smashed.length === 2, '每个地刺都收到 normalSmash', String(smashed.length))
    ok(smashed.every((s) => s === z), 'normalSmash 收到的是这只僵尸')
    ok(r === undefined && calls.length === 0, '不调用原实现（避免二次判定）')
    ok(T.stats.spikeKills === 1, '秒杀计数 +1')
  }

  // ─────────────────────── 5. 霹雳舞僵尸 ───────────────────────

  section('5. 霹雳舞 · 一次只踢一只 + 自扣 50')

  {
    const entry = find('breakdancerKick')
    const leaps = []
    const mkTarget = (x) => {
      const t = { worldPositionX: x, leapBy: (...a) => leaps.push({ x, a }) }
      return t
    }
    const a = mkTarget(110)
    const b = mkTarget(115)
    const lane = makeLane({ zombies: [a, b] })
    const z = new FakeZombie({
      worldPositionX: 100,
      reversed: false,
      worldPositionY: lane.midY,
      inLane: lane,
      objdataOwn: { KickDistance: 2 },
    })
    z.zombieKickable = (t) => t === a || t === b

    const { ctx, calls } = callCtx(z)
    T.handlerKick(entry, z, [], ctx.callNext)

    ok(leaps.length === 1, '只踢出一只（原本会 forEach 全部）', `实际 ${leaps.length}`)
    ok(leaps[0].x === 110, '踢的是范围内第一只', String(leaps[0].x))
    ok(calls.length === 0, '拦截了原实现')
    ok(z.damageTaken.length === 1 && z.damageTaken[0] === 50, '踢中后自扣 50', JSON.stringify(z.damageTaken))
    ok(T.stats.kicks === 1, '踢击计数 +1')

    // 空踢：范围内没人 → 不应该自扣
    const lane2 = makeLane({ zombies: [] })
    const z2 = new FakeZombie({ worldPositionX: 100, inLane: lane2, objdataOwn: { KickDistance: 2 } })
    z2.zombieKickable = () => false
    const c2 = callCtx(z2)
    T.handlerKick(entry, z2, [], c2.ctx.callNext)
    ok(z2.damageTaken.length === 0, '空踢不自扣', JSON.stringify(z2.damageTaken))
  }

  // ─────────────────────── 6. 麦克说唱家 ───────────────────────

  section('6. 麦克说唱家 · 甩完麦自杀')

  {
    const entry = find('mcSelfKill')
    const handler = T.makeSelfHitAfter(entry)
    const z = new FakeZombie()
    const { ctx, calls } = callCtx(z)
    handler(z, [], ctx.callNext)
    ok(calls.length === 1, '原攻击实现照常执行（伤害照打）')
    ok(z.damageTaken.length === 1, '甩完之后自己挨了一下')
    ok(z.damageTaken[0] >= 999999, '那一下是致死伤害', String(z.damageTaken[0]))
    ok(z.dead === true, '僵尸已死亡')
    ok(T.stats.mcSuicides === 1, '自杀计数 +1')

    // 已经死了就不再结算第二次
    const z2 = new FakeZombie({ dead: true })
    const c2 = callCtx(z2)
    handler(z2, [], c2.ctx.callNext)
    ok(z2.damageTaken.length === 0, '已死亡的僵尸不重复结算')
  }

  // ─────────────────────── 8. 章鱼僵尸 ───────────────────────

  section('8. 章鱼僵尸 · 每次投掷自扣 150')

  {
    const entry = find('octopusSelfHit')
    const handler = T.makeSelfHitAfter(entry)
    const z = new FakeZombie()
    const { ctx, calls } = callCtx(z)
    handler(z, [], ctx.callNext)
    ok(calls.length === 1, '原投掷实现照常执行')
    ok(z.damageTaken.length === 1 && z.damageTaken[0] === 150,
      '每次投掷自扣 150', JSON.stringify(z.damageTaken))

    // 投两次扣两次（章鱼不是自杀型，不做存活判断）
    handler(z, [], ctx.callNext)
    ok(z.damageTaken.length === 2, '第二次投掷继续扣血', String(z.damageTaken.length))
  }

  // ─────────────────────── 7. 失落巨人 ───────────────────────

  section('7. 失落巨人 · 火把持续焚烧')

  {
    const entry = find('lostGargBurn')
    const w = 68
    // 巨人朝右，身前一格内放一株植物、一株在范围外
    const near = new FakePlant(134, 40)
    const far = new FakePlant(400, 40)
    const tombNear = new FakePlant(140, 40)
    const lane = makeLane({ plants: [near, far], tombs: [tombNear] })
    const z = new FakeZombie({
      ignited: true,
      reversed: false,
      worldPositionX: 100,
      worldPositionY: 40,
      inLane: lane,
    })

    const { ctx } = callCtx(z, [1.0])
    T.handlerBurn(entry, z, [1.0], ctx.callNext)

    ok(near.damageTaken.length > 0, '身前植物被烧到')
    ok(Math.abs(near.damageTaken[0] - 1000) < 1e-6, '每秒 1000 火焰伤害', String(near.damageTaken[0]))
    ok(far.damageTaken.length === 0, '范围外的植物不受影响')
    ok(tombNear.damageTaken.length > 0, '墓碑同样被烧')

    // 火把熄灭 → 不烧
    const p2 = new FakePlant(134, 40)
    const lane2 = makeLane({ plants: [p2] })
    const z2 = new FakeZombie({ ignited: false, worldPositionX: 100, worldPositionY: 40, inLane: lane2 })
    const c2 = callCtx(z2, [1.0])
    T.handlerBurn(entry, z2, [1.0], c2.ctx.callNext)
    ok(p2.damageTaken.length === 0, '火把熄灭后停止焚烧')

    // dt 为 0 不结算
    const p3 = new FakePlant(134, 40)
    const lane3 = makeLane({ plants: [p3] })
    const z3 = new FakeZombie({ ignited: true, worldPositionX: 100, worldPositionY: 40, inLane: lane3 })
    const c3 = callCtx(z3, [0])
    T.handlerBurn(entry, z3, [0], c3.ctx.callNext)
    ok(p3.damageTaken.length === 0, 'dt 为 0 时不结算')
  }

  // ─────────────────────── 9. 弄臣 ───────────────────────

  section('9. 弄臣 · 旋转期间持续掉血')

  {
    const entry = find('jesterRotate')
    const z = new FakeZombie({ rotating: true })
    const { ctx } = callCtx(z, [1.0])
    T.handlerRotate(entry, z, [1.0], ctx.callNext)
    ok(z.damageTaken.length === 1, '旋转中掉血一次')
    ok(Math.abs(z.damageTaken[0] - 20) < 1e-9, '每秒 20 点', String(z.damageTaken[0]))

    // 按 dt 等比例（半秒掉 10）
    const z2 = new FakeZombie({ rotating: true })
    const c2 = callCtx(z2, [0.5])
    T.handlerRotate(entry, z2, [0.5], c2.ctx.callNext)
    ok(Math.abs(z2.damageTaken[0] - 10) < 1e-9, '半秒掉 10（按 dt 比例）', String(z2.damageTaken[0]))

    // 没在旋转就不掉
    const z3 = new FakeZombie({ rotating: false })
    const c3 = callCtx(z3, [1.0])
    T.handlerRotate(entry, z3, [1.0], c3.ctx.callNext)
    ok(z3.damageTaken.length === 0, '未旋转时不掉血')
  }

  // ─────────────────────── 10. 未来三只自爆 ───────────────────────

  section('10. 未来三只 · 死亡自爆')

  {
    const entry = find('futureBomb', 'FutureMechConeZombie')
    const inside = new FakePlant(120, 40)
    const edge = new FakePlant(160, 40)      // dx=60 ≤ 68/2*2/2=68 → 命中
    const outside = new FakePlant(200, 40)   // dx=100 > 68 → 范围外
    const lane = makeLane({ plants: [inside, edge, outside] })
    const z = new FakeZombie({ worldPositionX: 100, worldPositionY: 40, inLane: lane })

    const { ctx, calls } = callCtx(z)
    T.handlerBomb(entry, z, [], ctx.callNext)
    ok(calls.length === 1, '原死亡流程照常执行')
    ok(inside.damageTaken[0] === 1800, '范围内植物吃满 1800', String(inside.damageTaken[0]))
    ok(edge.damageTaken.length === 1, '半径边缘的植物也命中')
    ok(outside.damageTaken.length === 0, '范围外植物不受影响')
    ok(T.stats.bombs === 1, '自爆计数 +1')
    ok(T.stats.explodeHits === 2, '命中计数 = 2', String(T.stats.explodeHits))

    // 三个死亡入口可能先后触发，但同一只只能炸一次
    T.handlerBomb(entry, z, [], ctx.callNext)
    T.handlerBomb(entry, z, [], ctx.callNext)
    ok(inside.damageTaken.length === 1, '同一只僵尸只炸一次（多入口去重）', String(inside.damageTaken.length))

    // 另一个实例照常炸
    const z2 = new FakeZombie({ worldPositionX: 100, worldPositionY: 40, inLane: lane })
    const c2 = callCtx(z2)
    T.handlerBomb(entry, z2, [], c2.ctx.callNext)
    ok(inside.damageTaken.length === 2, '换一只僵尸可以再炸', String(inside.damageTaken.length))
  }

  section('10b. 自爆的降级路径')

  {
    const entry = find('futureBomb', 'FutureMechConeZombie')

    // ① 拿不到 Rectangle → 退回「水平距离一格以内」
    T.setRefs({ Rectangle: null })
    const near = new FakePlant(120, 40)     // dx=20
    const far = new FakePlant(200, 40)      // dx=100
    const lane = makeLane({ plants: [near, far] })
    const z = new FakeZombie({ worldPositionX: 100, worldPositionY: 40, inLane: lane })
    const before = T.stats.bombs
    T.handlerBomb(entry, z, [], callCtx(z).ctx.callNext)
    ok(T.stats.bombs === before + 1, '缺 Rectangle 时仍然执行了自爆')
    ok(near.damageTaken.length === 1, '距离近似路径命中近处植物')
    ok(far.damageTaken.length === 0, '距离近似路径排除远处植物')

    // ② 连 ZombieDamageDetails 都没有 → 不炸，但写日志、不抛异常
    T.setRefs({ ZombieDamageDetails: null })
    const lane2 = makeLane({ plants: [new FakePlant(120, 40)] })
    const z2 = new FakeZombie({ worldPositionX: 100, worldPositionY: 40, inLane: lane2 })
    let threw = false
    const before2 = T.stats.bombs
    try { T.handlerBomb(entry, z2, [], callCtx(z2).ctx.callNext) } catch (e) { threw = true }
    ok(!threw, '依赖全缺时不抛异常')
    ok(T.stats.bombs === before2, '依赖缺失时不计入自爆')
    ok(T.getDiag().some((l) => l.includes('自爆未执行')), '写下了「自爆未执行」的诊断',
      T.getDiag().slice(-2).join(' | '))

    // ③ 拿不到植物池 → 也写日志
    T.setRefs(makeRefs())
    const z3 = new FakeZombie({ worldPositionX: 100, worldPositionY: 40, inLane: {} })
    T.handlerBomb(entry, z3, [], callCtx(z3).ctx.callNext)
    ok(T.getDiag().some((l) => l.includes('plantPool')), '拿不到 plantPool 时写明原因')
  }

  // ─────────────────────── 通用：异常安全 ───────────────────────

  section('11. 异常安全')

  {
    T.setRefs({ cc: null, Vec2: null, Rectangle: null, Square: null, ZombieDamageDetails: null, ZombieDamageType: null })
    const z = new FakeZombie()
    const modes = ['block', 'arcade', 'spike', 'kick', 'selfHitAfter', 'burn', 'rotate', 'bomb']
    let threw = 0
    for (const mode of modes) {
      const entry = { key: 'octopusSelfHit', label: 't', names: ['X'], module: 'm', methods: ['m'], mode, hit: 'octopusThrowSelfHit' }
      try {
        const handler = T.makeHandler(entry)
        handler({ thisArg: z, args: [0.1], callNext: () => 'NEXT' })
      } catch (e) { threw += 1 }
    }
    ok(threw === 0, '依赖全缺时 8 种模式都不抛异常', `抛了 ${threw} 次`)

    // 恢复，别影响后面的断言
    T.setRefs(makeRefs())
  }
}
