/**
 * 妙趣横生的僵尸调整 — 运行期入口
 * Copyright (c) 2026 YG — MIT License（完整条款见仓库根 LICENSE，素材与引用声明见 NOTICE.md）
 *
 * 十条需求里，小鬼血量是数据（jsons/objects/ZombieProps.json），其余九条在这里。
 *
 * ── 引擎事实（对 0.15.0 的 assets/main/index.js 逐段核对所得）──
 *  2. 重金属巨人：基类 GargantuarZombie 的 onSmashing 是空函数，砸植物走 _smash()（SmashDamage）；
 *     八十年代表演世界覆写 onSmashing = 放音效 + shootOnePea(WaveType='eighties_gargantuar_wave')。
 *     那颗波投射物在 ProjectileProps 里 Damage=1000 —— 这就是它的 AOE。
 *     ⇒ 拦掉 onSmashing 即可去掉 AOE，普通砸击（1500）分毫不动。
 *  3. 街机：EightiesArcadeCabinet（游戏机本体，挂在墓碑/道具池里）的召唤在 specialTombUpdate 里：
 *       this.summonCD -= dt; this.summonCD <= 0 && (this.summonCD = getRandom(SummonInterval); SpawnZombieByZombieType(...))
 *     默认池 SummonnedZombies = [60% eighties_8bit, 30% eighties_8bit_armor1, 10% eighties_8bit_armor2]。
 *     ⇒ 把 armor2 从实例的池子里摘掉 + 召唤发生时自扣血。
 *  4. 地刺：引擎给僵尸的 whenStabbedBySpikeWeed(spikeweeds) 钩子，载具类（钢琴、弹射器、滚桶、雪橇）
 *     都是「this.playDie() + 让地刺 normalSmash(this)」这一套。闪耀僵尸没覆写，所以照抄这套即可。
 *  5. 霹雳舞：kick() 里对 1.5 格矩形内**所有**可踢僵尸 forEach 做 leapBy。
 *     ⇒ 换成「只挑一只」，踢到一只后自己掉 50 血。
 *  6. 麦克说唱家：甩麦走 specialAnimationListener 的 "attack" 事件 → attack()（JamAttackDamage=2001）。
 *     ⇒ 在 attack 之后把自己打死。
 *  8. 章鱼：投掷在 specialAnimationListener 的 "throw" 事件 → _throw()。
 *     ⇒ _throw 之后自扣 150。
 *  9. 弄臣：specialZombieUpdate 里维护 rotating 状态。
 *     ⇒ rotating 期间按秒持续掉血。
 */
const CFG = {
  arcadeSummonSelfHit: 100, // 街机柜每召唤一次小怪，自己掉多少血（需求未给数值，这里取 100）
  breakdancerKickSelfHit: 50, // 霹雳舞每踢一次自扣（需求指定 50）
  octopusThrowSelfHit: 150, // 章鱼每扔一次自扣（需求指定 150）
  jesterRotateSelfHitPerSec: 20, // 弄臣旋转时每秒掉血
  pixelZombieSelfHitPerSec: 10, // 6. 像素僵尸每秒自扣（无视防具）
  kingGuardianImpType: 'imp', // 10. 守护小鬼 codename（走 SpawnZombieByZombieType）
  kingGuardianImpEnum: 12, // 10. 同上，走 SpawnZombie 时用的枚举值（ZombieEnum.imp = 12）
  kingGuardianSpawnStyle: 0, // 10. 生成风格（LnCSpawnZombieStyleEnum.appear = 0）
  kingGuardianOpacity: 0.35, // 10. 隐形程度（0 = 全透明，1 = 正常）
  jamDamageReduction: 0.5, // 2. 舞台效果期间减伤比例
  kingStageHpStaff: 200, // 10. 杖国王（dark_king）出场期间的临时血量
  kingStageHpSword: 300, // 10. 剑国王（dark_king_veteran）出场期间的临时血量
  kingKnightSelfHit: 150, // 11. 国王每授爵一次自扣（需求指定 150）
  selfKillDamage: 999999, // 「自杀」用的致死伤害

  /* ── 1.4.0 ── */
  gargKillHeal: 900, // 黑暗巨尸：每击杀一个单位回复的血量（需求指定 900）
  lobberHeadshotMult: 4, // 投手砸中被点名僵尸时的伤害倍率（需求指定 4 倍）
  fisherForwardChance: 0.1, // 渔夫：10% 把自己往前拽一格
  fisherSelfHitChance: 0.2, // 渔夫：20% 用力过猛自扣 100
  fisherNothingChance: 0.2, // 渔夫：20% 完全没反应
  fisherSelfHitDamage: 100, // 渔夫自扣数值
  fisherForwardSquares: 1, // 往前拽几格
}

/**
 * 投手「爆头 4 倍」的目标 —— 被砸中头部就当场报废的那几只。
 * 「冰车」按造冰车僵尸（zomboni）实现；若日后要换成雪橇队，把它加进名单即可。
 */
/**
 * 运行时判身份必须用 `zombie.ID`（ZombieEnum 数字），**不能靠 codename**：
 * `zombieCodename()` 要去 engine 查僵尸表，而 startup 之后引擎访问已关闭，一律返回 null。
 * 下面这些数字取自 0.15.0 引擎的 ZombieEnum（`e[e.KEY=NN]="KEY"` 形式），已逐个核对。
 */
const HEADSHOT_TARGET_IDS = [
  174, // future_gargantuar 巨尸统领者
  23, // catapult 投石车
  22, // zomboni 造冰车
  365, // sky_twin 双舱飞行僵尸
  363, // sky_twin_upper 双舱（上）
  364, // sky_twin_lower 双舱（下）
  366, // sky_airraid_twin 空袭双舱
]

/** 二类防具：modern_newspaper 17 / newspaper_veteran 18 / camel_segment 78 / camel_onehump 79 */
const PAPER_TARGET_IDS = [17, 18, 78, 79]

/** 按 ZombieEnum 数字判身份（拿不到 ID 时退回 codename，那条路可能失效但不至于抛错） */
function idInList(z, ids, nameList) {
  try {
    if (z && typeof z.ID === 'number') return ids.indexOf(z.ID) >= 0
  } catch (err) {}
  return nameList ? codenameInList(z, nameList) : false
}

const HEADSHOT_TARGETS = [
  'future_gargantuar', // 巨尸统领者
  'catapult', // 投石车僵尸
  'zomboni', // 造冰车僵尸
  'sky_twin', // 双舱飞行僵尸（本体）
  'sky_twin_upper', // 双舱（上）
  'sky_twin_lower', // 双舱（下）
  'sky_airraid_twin', // 空袭双舱
]

/**
 * 二类防具（纸制品）—— 报纸 / 杂志 / 骆驼牌。
 * 引擎里它们不是 armors 数组，而是类内 `paperHealth`（骆驼牌则根本没有甲层）。
 * 所以「二类」= 地刺、电击、投掷这三类伤害不吃纸，直接打本体。
 */
const PAPER_TARGETS = [
  'modern_newspaper',
  'newspaper',
  'beepaper',
  'newspaper_veteran', // 周刊 / 周日版
  'camel_segment',
  'camel_onehump',
  'camel_twohump',
  'camel_threehump',
  'camel_manyhump',
]


/** 像素僵尸的 ID —— 取自 Zombies.ts 的 ZombieEnum（eighties_8bit = 334） */
/**
 * 像素僵尸的 ID 白名单 —— 取自 Zombies.ts 的 ZombieEnum：
 *   334 = eighties_8bit        像素僵尸
 *   335 = eighties_8bit_armor1 像素路障僵尸
 *   336 = eighties_8bit_armor2 像素铁桶僵尸
 *
 * 1.2.5：原先只列了 334，导致**路障与铁桶两个变体不掉血**。
 */
const PIXEL_ZOMBIE_IDS = [334, 335, 336]

/**
 * 免疫冰系的僵尸 ID（取自 ZombieEnum）：
 *   229 = iceage_imp（雪人小鬼）
 *   387 = treasureyeti（宝藏雪人）
 *
 * 1.1.0 时曾把冰鼬（228 / 227）算进来，1.2.0 按反馈**移除** ——
 * 需求要的是「冰河小鬼」，而冰鼬是另一条线。
 *
 * 另外把冰冻与减速两个下发口一并拦掉（见 handlerIceImmune）：
 * 只要在 `ICE_IMMUNE_IDS` 里，就完全不吃冰系控制。
 */
const ICE_IMMUNE_IDS = [229, 387]


/**
 * 2. 巨人死后留下的障碍物对照表。
 * 左侧是 ZombieFeatures 里的巨人 codename，右侧是 TombstoneProps 里的障碍物 codename。
 * `null` 表示该世界没有对应障碍物 → 按需求改留小鬼木桶。
 * `future_gargantuar`（未来机甲巨人）按需求**除外**，故不在表内。
 */
const GARG_TOMBSTONE = {
  tutorial_gargantuar: 'gravestone_tutorial',
  egypt_gargantuar: 'gravestone_egypt',
  pirate_gargantuar: 'pirate_barrel',
  cowboy_gargantuar: 'gravestone_cowboy',
  dark_gargantuar: 'gravestone_dark',
  iceage_gargantuar: 'gravestone_iceage',
  lostcity_gargantuar: 'gravestone_lostcity',
  beach_gargantuar: null,
  eighties_gargantuar: null,
  dino_gargantuar: null,
  sky_gargantuar: null,
}

/** 没有对应障碍物的世界统一留这个（海盗木桶，就是会弹小鬼的那只） */
const FALLBACK_TOMBSTONE = 'pirate_barrel'

/** 功夫铜人：死后随机留一个兵器架 */
const KONGFU_RACKS = [
  'kongfu_rack_torch', 'kongfu_rack_blade', 'kongfu_rack_bomb', 'kongfu_rack_flag',
  'kongfu_rack_nunchaku', 'kongfu_rack_hammer', 'kongfu_rack_helmet',
  'kongfu_rack_fan', 'kongfu_rack_3section_staff',
]

/** 三个铜人（功夫世界的「巨人」位） */
const KONGFU_BRONZE = ['kongfu_bronze_chi', 'kongfu_bronze_strong', 'kongfu_bronze_hook']

/** 每个类：定位名候选 + 模块路径 + 要包的方法 + 行为模式 */
const TARGETS = [
  // 1.2.0：改挂 specialGargantuarUpdate。
  // `onSmashing` 只在 `_smash()` 末尾被调用 —— 也就是**砸到东西时才触发**，
  // 场上没目标（空 A）时钩子根本不跑，扔小鬼自然也就没发生。
  // `specialGargantuarUpdate` 是舞台效果期间的每帧入口，无论砸不砸都跑。
  // 1.2.4：舞台效果期间不做音波、也不扔鬼 —— 只做减伤 50%。
  // 用 `extraDamageScale` 返回 0.5（与火龙小鬼免疫火焰是同一套机制）。
  { key: 'jamReduce', label: '重金属巨人·舞台效果期间减伤50%', names: ['EightiesGargantuarZombie'], module: 'chunks:///_virtual/EightiesGargantuarZombie.ts', methods: ['extraDamageScale'], mode: 'jamReduce' },
  // 1.2.5：音波必须一并删掉 —— 减伤 50% 再叠音波太 OP。
  { key: 'gargantuarMute', label: '重金属巨人·移除音波斩', names: ['EightiesGargantuarZombie'], module: 'chunks:///_virtual/EightiesGargantuarZombie.ts', methods: ['onSmashing'], mode: 'muteAoe' },
  { key: 'arcadeSummon', label: '街机游戏机·召唤自扣血+禁铁桶', names: ['EightiesArcadeCabinet'], module: 'chunks:///_virtual/EightiesArcadeCabinet.ts', methods: ['specialTombUpdate'], mode: 'arcade' },
  { key: 'glitterSpike', label: '轮滑（闪耀）·地刺秒杀', names: ['EightiesGlitterZombie', 'EightiesGlitterZombieZombie'], module: 'chunks:///_virtual/EightiesGlitterZombie.ts', methods: ['whenStabbedBySpikeWeed'], mode: 'spike' },
  { key: 'breakdancerKick', label: '霹雳舞·一次只踢一只+自扣50', names: ['EightiesBreakDancerZombie', 'EightiesBreakDancerZombieZombie'], module: 'chunks:///_virtual/EightiesBreakDancerZombie.ts', methods: ['kick'], mode: 'kick' },
  { key: 'mcSelfKill', label: '麦克说唱家·甩完麦自杀', names: ['EightiesMCZombie'], module: 'chunks:///_virtual/EightiesMCZombie.ts', methods: ['attack'], mode: 'selfHitAfter', hit: 'selfKillDamage' },
  { key: 'octopusSelfHit', label: '章鱼僵尸·投掷自扣150', names: ['BeachOctopusZombie'], module: 'chunks:///_virtual/BeachOctopusZombie.ts', methods: ['_throw'], mode: 'selfHitAfter', hit: 'octopusThrowSelfHit' },
  { key: 'jesterRotate', label: '弄臣·旋转持续掉血', names: ['DarkJesterZombie'], module: 'chunks:///_virtual/DarkJesterZombie.ts', methods: ['specialZombieUpdate'], mode: 'rotate' },
  // ── 1. 脉冲黄桃：瘫痪并强制落地所有飞机（僵王除外）──
  // 基类 Zombie.empStun 是空函数，全引擎只有 12 处覆写，飞行僵尸里仅无人机有份。
  // 这里把五类飞机全部补上覆盖，落地靠 flying=false 触发 onLanding()。
  { key: 'empSky', label: '脉冲黄桃·小鬼飞机', names: ['SkyImpZombie'], module: 'chunks:///_virtual/SkyImpZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  { key: 'empSky', label: '脉冲黄桃·单体战斗机', names: ['SkyBattlePlaneZombie'], module: 'chunks:///_virtual/SkyBattlePlaneZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  { key: 'empSky', label: '脉冲黄桃·双体战斗机(上)', names: ['SkyTwinUpperZombie'], module: 'chunks:///_virtual/SkyTwinUpperZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  { key: 'empSky', label: '脉冲黄桃·双体战斗机(下)', names: ['SkyTwinLowerZombie'], module: 'chunks:///_virtual/SkyTwinLowerZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  { key: 'empSky', label: '脉冲黄桃·无人机', names: ['SkyDroneZombie'], module: 'chunks:///_virtual/SkyDroneZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  { key: 'empSky', label: '脉冲黄桃·裁决者', names: ['SkyArbiterXZombie'], module: 'chunks:///_virtual/SkyArbiterXZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  // ── 6. 像素僵尸：每秒自扣 10 血，无视防具 ──
  // eighties_8bit 是 ZombieEnum 值（334），没有专属引擎类，只能按 ID 过滤。
  // 挂 Zombie.prototype.characterUpdate —— 该入口不被任何僵尸子类覆写。
  { key: 'pixelDrain', label: '像素僵尸·每秒自扣10（破防）', names: ['Zombie'], module: 'chunks:///_virtual/Zombie.ts', methods: ['characterUpdate'], mode: 'pixelDrain' },
  // ── 7. 冰河小鬼 / 冰鼬：完全免疫冰系控制 ──
  { key: 'iceImmune', label: '雪人小鬼/宝藏雪人·免疫冰冻', names: ['Zombie'], module: 'chunks:///_virtual/Zombie.ts', methods: ['setFreeze'], mode: 'iceImmune' },
  { key: 'iceImmune', label: '雪人小鬼/宝藏雪人·免疫减速', names: ['Zombie'], module: 'chunks:///_virtual/Zombie.ts', methods: ['setChill'], mode: 'iceImmune' },
  // ── 10. 国王：出场动画期间解除「无敌帧」，改为高额易伤 ──
  // 引擎里国王的免打**不是** invincible，而是 onLaneSpawnSettled 里把命中框隐藏 2 秒：
  //   this.bodyRecHiddenCD = 2
  // 落地时 onDirtSpawned 再清零。这里把出场那段从「免打」改成「易伤窗口」。
  { key: 'kingExpose', label: '国王·出场解除无敌帧', names: ['DarkKingZombie', 'GridZombie'], module: 'chunks:///_virtual/DarkKingZombie.ts', methods: ['onLaneSpawnSettled'], mode: 'kingExpose' },
  // 落地回血由 entityForce 在 switching 转 false 时处理 —— 国王是 GridZombie，
  // 出场播 Spawn 动画、不走 playDirtSpawn，所以 onDirtSpawned 永远不会被调用。
  // 另：开场压血量已足够体现「出场虚弱」，按反馈不做易伤。
  // ── 11. 国王：每次授爵自扣血 ──
  // `DarkKingZombie._give()` 就是「给僵尸授爵」那一趟流程（异步方法）。
  { key: 'kingKnight', label: '国王·授爵自扣150', names: ['DarkKingZombie'], module: 'chunks:///_virtual/DarkKingZombie.ts', methods: ['_give'], mode: 'kingKnight' },
  // ── 10. 国王：出场动画期间强制拥有实体 ──
  // 出场整段 switching = true，基类 setBodyRec 会把 bodyRec 置成空矩形 —— 那才是「打不到」的真因。
  // 在 setBodyRec 这一层强制走正常路径；落地后 __zfaKingExposed 清掉，交还引擎。
  { key: 'entityForce', label: '国王·出场期间强制拥有实体', names: ['Zombie'], module: 'chunks:///_virtual/Zombie.ts', methods: ['setBodyRec'], mode: 'entityForce' },
  // ── 10. 国王：出场期间生成「隐形小鬼」，打死它即可拦截国王 ──
  // 1.2.3：国王改挂基类。DarkKingZombie 一旦定位不到就整条失效，
  // 这里同时对 Zombie 与 GridZombie 两个基类各挂一次，谁在就用谁。
  // ── 10. 国王拦截：1.2.5 按指示移除（做了多版都拦不住，不再尝试）──
  // ── 2. 巨人死后留下对应世界的墓碑/障碍物 ──
  // 挂巨人基类，21 个巨人都继承它；是否留下、留什么由 codename 查表决定。
  // ── 1.4.0 新增四条 ──
  // 1) 黑暗巨尸：_smash 是巨人**唯一**的伤害出口（植物/僵尸/墓碑/粘液都从这里分派），
  //    而 onSmashing 砸空也会触发、拿不到实际目标。所以包 _smash 做「前后存活快照」。
  //    注意 throwImp 全程不发 dealDamage，扔小鬼不会杀僵尸 —— 击杀只可能来自这一锤。
  { key: 'gargHeal', label: '黑暗巨尸·击杀回血900', names: ['DarkGargantuarZombie'], module: 'chunks:///_virtual/DarkGargantuarZombie.ts', methods: ['_smash'], mode: 'gargHeal' },
  // 1.4.1：击杀捕获。巨人砸死植物走 Plant.kill，砸死僵尸走 Zombie.playDie ——
  // 只在这两只死亡入口上补观测，靠 smashCtx 限定「仅在巨尸这一锤的同步窗口内」计数。
  { key: 'victimPlantKill', label: '击杀捕获·植物死亡', names: ['Plant'], module: 'chunks:///_virtual/Plant.ts', methods: ['kill'], mode: 'victimKill' },
  { key: 'victimZombieDie', label: '击杀捕获·僵尸死亡', names: ['Zombie'], module: 'chunks:///_virtual/Zombie.ts', methods: ['playDie'], mode: 'victimKill' },
  // 2) 投手 4 倍：投手 = CabbagePultPlant 基类（MelonPult/KernelPult/PepperPult 都继承它）。
  //    _lobToZombie 返回 Promise<prj>，原函数本就用 setDamage 改弹体伤害，照同一手法乘 4。
  // 1.4.3：改从**弹体命中的必经之路**接入。原来挂 `CabbagePultPlant._lobToZombie`，
  // 那条路依赖类定位成功（`_lobToZombie` 是编译后的生成器，未必能按 ccclass 拿到）。
  // `commonShot.dealDamageToZombie` 是所有弹体的命中结算点，内部 `new SplashDamage(this.damage, …)`
  // 自建伤害 —— 所以在调用期间临时改 `this.damage`，本体与溅射会一起放大。
  // 只对 `gravity > 0`（抛物线 = 投掷物）生效，普通直线弹不受影响。
  { key: 'lobHit', label: '投掷弹命中·爆头4倍/绕纸', names: ['commonShot'], module: 'chunks:///_virtual/Projectiles.ts', methods: ['dealDamageToZombie'], mode: 'lobHit' },
  // 3) 二类防具·电击：报纸的护甲层在 dealDamage 里，只有 armorProtection=true 才吃纸。
  //    电击 damageType = electricity(2)，据此把 armorProtection 关掉即可直击本体。
  { key: 'paperBypass', label: '二类防具·电击绕过纸', names: ['ModernNewspaperZombie'], module: 'chunks:///_virtual/ModernNewspaperZombie.ts', methods: ['dealDamage'], mode: 'paperBypass' },
  // 4) 渔夫：拉植物入口是 hookCall(plant, zombie, tomb) —— 返回要拉多久。
  //    空调用（目标离开草坪 / 停用）也会进来，必须排除，否则会误掷骰。
  // 1.4.1 修正：`hookCall` 属于一个没有 ccclass 注册的内部 hook 类，按类名根本拿不到。
  // 唯一可靠路径是从僵尸实例上取 `hookShot`（引擎在 _shoot 里把钩子实例挂上去），
  // 所以改成每帧看一眼实例、给它的 hookCall 打一次性补丁 —— 实例级，不影响别的僵尸。
  { key: 'fisherGamble', label: '渔夫·拉植物改成抽奖', names: ['BeachFisherZombie'], module: 'chunks:///_virtual/BeachFisherZombie.ts', methods: ['update', 'characterUpdate'], mode: 'fisherPatch' },
]

/* ────────────────────── 基础设施 ────────────────────── */
const diagLines = []
const notedOnce = new Set()
const resolved = new Map()
const stats = { jamReduced: 0, aoesMuted: 0, empDrops: 0, pixelTicks: 0, iceImmune: 0, kingExposed: 0, kingLanded: 0, kingKnights: 0, dropshipsExposed: 0, kingGuards: 0, kingIntercepts: 0, arcadeSummons: 0, spikeKills: 0, kicks: 0, selfHits: 0, mcSuicides: 0, rotateTicks: 0, gargHeals: 0, gargHealHp: 0, lobHeadshots: 0, paperBypasses: 0, fisherRolls: 0, fisherForward: 0, fisherSelfHits: 0, fisherIdle: 0 }

let activeCtx = null

const REFS = { cc: null, Vec2: null, Rectangle: null, Square: null, ZombieDamageDetails: null, ZombieDamageType: null, PrjFunctions: null }

const SQUARE_W_FALLBACK = 68
const SQUARE_H_FALLBACK = 80.77

function note(line) {
  try {
    if (diagLines.length >= 200) return
    diagLines.push(String(line))
  } catch (err) {}
}

/** 关键事件：既进诊断缓冲，也立刻写进游戏日志（搜 [僵尸调整] 就能看到） */
function logLine(ctx, line) {
  note(line)
  const c = ctx || activeCtx
  try {
    if (c && c.log && typeof c.log.info === 'function') c.log.info('[僵尸调整] ' + line)
  } catch (err) {}
}
function noteOnce(key, line) {
  try {
    if (notedOnce.has(key)) return
    notedOnce.add(key)
    note(line)
  } catch (err) {}
}
function errText(err) {
  return err && err.message ? err.message : String(err)
}

function moduleExport(engine, modulePath, exportName) {
  if (!engine || typeof engine.getModuleExport !== 'function') return null
  try {
    const got = engine.getModuleExport(modulePath, exportName)
    return typeof got === 'function' ? got : null
  } catch (err) {
    noteOnce('exp:' + exportName, `getModuleExport(${exportName}) 抛错 ${errText(err)}`)
    return null
  }
}

/** 导出值不一定是函数（例如 ZombieDamageType 是个枚举对象），这里要原样拿回来 */
function moduleValue(engine, modulePath, exportName) {
  if (!engine || typeof engine.getModuleExport !== 'function') return null
  try {
    const got = engine.getModuleExport(modulePath, exportName)
    return got === undefined ? null : got
  } catch (err) {
    noteOnce('val:' + exportName, `getModuleExport(${exportName}) 抛错 ${errText(err)}`)
    return null
  }
}

function ccClass(engine, name) {
  try {
    const cc = engine && typeof engine.getCc === 'function' ? engine.getCc() : null
    const got = cc && cc.js && cc.js.getClassByName ? cc.js.getClassByName(name) : null
    if (typeof got === 'function') return got
  } catch (err) {}
  try {
    const got = engine && typeof engine.getClassByName === 'function' ? engine.getClassByName(name) : null
    if (typeof got === 'function') return got
  } catch (err) {}
  return null
}

/** 多路定位，并且要求原型上真有目标方法（能自动把门面/同名干扰类剔掉） */
function locateClass(engine, names, modulePath, methodName) {
  const push = []
  for (const n of names) push.push(['getModuleExport(' + n + ')', moduleExport(engine, modulePath, n)])
  for (const n of names) push.push(['cc.js(' + n + ')', ccClass(engine, n)])
  for (const [how, cls] of push) {
    if (typeof cls !== 'function' || !cls.prototype) continue
    if (typeof cls.prototype[methodName] === 'function') return { cls, how }
  }
  // 目标方法可能是继承来的：退一步，只看 prototype 是否存在
  for (const [how, cls] of push) {
    if (typeof cls === 'function' && cls.prototype) return { cls, how }
  }
  return null
}

function resolveEngineRefs(engine, ctx) {
  try {
    const cc = engine && typeof engine.getCc === 'function' ? engine.getCc() : null
    REFS.cc = cc || null
    REFS.Vec2 = (cc && cc.Vec2) || null
  } catch (err) {
    note('cc 命名空间解析失败 ' + errText(err))
  }
  REFS.Rectangle = moduleExport(engine, 'chunks:///_virtual/CharacterManager.ts', 'Rectangle')
  REFS.ZombieDamageDetails = moduleExport(engine, 'chunks:///_virtual/CharacterManager.ts', 'ZombieDamageDetails')
  REFS.ZombieDamageType = moduleValue(engine, 'chunks:///_virtual/CharacterManager.ts', 'ZombieDamageType')
  REFS.Square = moduleExport(engine, 'chunks:///_virtual/Square.ts', 'Square')
  // 地刺伤害入口（PrjFunctions.stabOnZombie）——是个工具对象而不是类，必须在这里取
  REFS.PrjFunctions = moduleValue(engine, 'chunks:///_virtual/Projectiles.ts', 'PrjFunctions')
  const line =
    '依赖：Rectangle=' + (REFS.Rectangle ? 'ok' : '缺') +
    ' ZombieDamageDetails=' + (REFS.ZombieDamageDetails ? 'ok' : '缺') +
    ' ZombieDamageType=' + (REFS.ZombieDamageType ? 'ok' : '缺') +
    ' Square=' + (REFS.Square ? 'ok' : '缺') +
    ' PrjFunctions=' + (REFS.PrjFunctions ? 'ok' : '缺') +
    ' Vec2=' + (REFS.Vec2 ? 'ok' : '缺')
  note(line)
  try {
    if (ctx && ctx.log && typeof ctx.log.info === 'function') ctx.log.info('[僵尸调整] ' + line)
  } catch (err) {}
}

function squareSize() {
  let w = SQUARE_W_FALLBACK
  let h = SQUARE_H_FALLBACK
  try {
    const S = REFS.Square
    if (S && typeof S.SquareWidth === 'number') w = S.SquareWidth
    if (S && typeof S.SquareHeight === 'number') h = S.SquareHeight
  } catch (err) {}
  return { w, h }
}

/** 以 (x, y) 为中心、宽 squaresW 格的矩形；拿不到引擎 Rectangle 就返回 null */
function makeRect(x, y, squaresW, height) {
  const R = REFS.Rectangle
  const V2 = REFS.Vec2
  if (!R || !V2 || typeof R.createRectangleCenter !== 'function') return null
  try {
    return R.createRectangleCenter(new V2(x, y), squaresW, height)
  } catch (err) {
    noteOnce('rect', '建矩形失败：' + errText(err))
    return null
  }
}

/** 给自己来一下（走引擎伤害管线，死亡动画/音效照常） */
function selfHit(z, amount) {
  const ZDD = REFS.ZombieDamageDetails
  if (!ZDD || !z) return false
  try {
    const d = new ZDD(amount, true, true, true, null)
    z.dealDamage(d)
    stats.selfHits += 1
    return true
  } catch (err) {
    noteOnce('selfhit', '自伤失败：' + errText(err))
    return false
  }
}

/* ────────────────────── 各条行为 ────────────────────── */

/**
 * 2. 重金属巨人：舞台效果期间减伤 50%。
 *
 * 1.2.4 需求明确：不做音波斩、也不扔鬼 —— 舞台效果期间只保留一条，
 * 即承受的伤害乘以 0.5。
 *
 * 引擎依据：`extraDamageScale` 是 `defaultDealDamage` 结算链上的一环，
 * 返回值会乘进最终伤害 —— 火龙小鬼免疫火焰就是靠它返回 0。
 */
function handlerJamReduce(entry, thisArg, args, callNext) {
  const base = callNext(...args)
  try {
    if (isInJamNow(thisArg)) {
      const mul = typeof base === 'number' ? base : 1
      stats.jamReduced += 1
      return mul * (1 - CFG.jamDamageReduction)
    }
  } catch (err) {
    noteOnce('jamreduce', '舞台减伤判定失败：' + errText(err))
  }
  return base
}

/** 是否处于舞台效果期间 */
function isInJamNow(z) {
  try { return !!(z && z.isInJam === true) } catch (e) { return false }
}

/**
 * 2. 重金属巨人：拦掉音波斩。
 *
 * 1.2.5 按反馈补上 —— 舞台效果期间已经有减伤 50%，再叠音波太 OP。
 * 引擎里音波只在 `isInJam` 期间于 `onSmashing` 末段射出，整体拦掉即可，
 * 普通砸击（走另一条路径）不受影响。
 */
function handlerMuteAoe(entry, thisArg, args, callNext) {
  stats.aoesMuted += 1
  noteOnce('aoe', '已拦截重金属巨人的音波斩（普通砸击保留）')
  return undefined
}

/**
 * 10. 国王：出场动画期间解除「无敌帧」。
 *
 * 引擎里国王的免打**不是** `invincible`，而是：
 *   onLaneSpawnSettled → this.bodyRecHiddenCD = 2    // 命中框隐藏 2 秒
 *   onDirtSpawned      → this.bodyRecHiddenCD = 0    // 落地恢复
 * 命中框隐藏期间植物的检测器扫不到它，表现出来就是「打不出伤害」。
 *
 * 这里在出场时把 `bodyRecHiddenCD` 清零，并打上「易伤中」标记 ——
 * 于是整段出场动画期间它都可以被打，并由 handlerKingVuln 放大伤害。
 */
function handlerKingExpose(entry, thisArg, args, callNext) {
  const r = callNext(...args)
  try {
    if (isKingZombie(thisArg)) {
      thisArg.__zfaKingExposed = true
      thisArg.bodyRecHiddenCD = 0        // 解除命中框隐藏

      // 出场期间把血量上限与当前血量一起压到指定值（杖 200 / 剑 300），
      // 落地时由 handlerKingLanded 按比例还原。记下原值备用。
      const staged = thisArg.ID === 188 ? CFG.kingStageHpSword : CFG.kingStageHpStaff
      thisArg.__zfaKingOrigToughness = thisArg.toughness
      try { thisArg.toughness = staged } catch (e) { /* 只读就跳过 */ }
      try { thisArg.health = staged } catch (e) { /* 同上 */ }

      // 关键：植物检测器只看 `bodyRecForShooter`，而它在 `depth > 40`（还在天上）时
      // 返回**空矩形** —— 这才是真正打不到的原因。这里把它短路成真实命中框。
      try {
        if (!thisArg.__zfaKingRecPatched) {
          thisArg.__zfaKingRecPatched = true
          Object.defineProperty(thisArg, 'bodyRecForShooter', {
            configurable: true,
            get() { return this.bodyRec },
          })
        }
      } catch (e) { /* 实例上定义失败就退化为只改 bodyRecHiddenCD */ }

      stats.kingExposed += 1
      note('国王：出场期间已解除无敌帧，进入易伤窗口')
    }
  } catch (err) {
    noteOnce('kingexpose', '国王出场解除失败：' + errText(err))
  }
  return r
}

/**
 * 11. 国王：每次授爵自扣血（国王与亚瑟王都生效）。
 *
 * `DarkKingZombie._give()` 就是「给僵尸授爵」那趟流程 —— 它会随机挑一条相邻行，
 * 再挑一只通过 `zombieCanAddArmor` 的僵尸把护甲挂上去。
 *
 * 扣血用 `selfHitIgnoreArmor`（直接改 health 的真实伤害），
 * 因为国王身上有一堆空实现的免伤方法，走常规伤害管线不保证生效。
 */
function handlerKingKnight(entry, thisArg, args, callNext) {
  const r = callNext(...args)   // 原授爵流程照常跑（异步方法，返回 Promise）
  try {
    if (isKingZombie(thisArg) && !thisArg.dead) {
      selfHitIgnoreArmor(thisArg, CFG.kingKnightSelfHit)
      stats.kingKnights += 1
      note('国王：授爵一次，自扣 ' + CFG.kingKnightSelfHit + ' 血')
    }
  } catch (err) {
    noteOnce('kingknight', '国王授爵扣血失败：' + errText(err))
  }
  return r
}

/**
 * 该僵尸是不是国王 —— **ID 优先**。
 *
 * 1.2.10 之前的教训：只靠 `zombieCodename()`，而它依赖 Zombies 模块的导出名，
 * 一旦对不上就恒定返回 null，于是 isKing 永远 false、整条逻辑一行不跑 —— 表现出来就是「改了没效果」。
 * 现在 ID 优先（ZombieEnum: dark_king = 187 / dark_king_veteran = 188），codename 仅作兜底。
 */
function isKingZombie(z) {
  try {
    if (!z) return false
    if (z.ID === 187 || z.ID === 188) return true
    const code = zombieCodename(z)
    return !!(code && /^dark_king/.test(code))
  } catch (e) { return false }
}

/** 该僵尸是不是运兵艇 —— 同样 ID 优先（ZombieEnum: sky_dropship = 362） */
function isDropshipZombie(z) {
  try {
    if (!z) return false
    if (z.ID === 362) return true
    const code = zombieCodename(z)
    if (code === 'sky_dropship') return true
    // 再兜一层：它的专属 objdata 带 ImpType = 'sky_imp'
    const od = z.objdataOwn
    return !!(od && od.ImpType === 'sky_imp' && od.ImpCount)
  } catch (e) { return false }
}

/**
 * 10. 国王：出场动画期间强制拥有实体，落地后交还引擎。
 *
 * `bodyRec` 由基类 `setBodyRec` 周期性重算，而出场整段 `switching = true`
 * 会让它被置成空矩形 —— 那才是「打不到」的真因。
 * 这里在 `setBodyRec` 这一层强制 `callNext(false)`，绕过原实现的置空分支。
 *
 * ⚠️ 不改 `switching` 本身 —— 1.2.11 那样做过，会打断国王随后的授勋流程。
 */
function handlerEntityForce(entry, thisArg, args, callNext) {
  try {
    if (thisArg && thisArg.__zfaKingExposed && isKingZombie(thisArg)) {
      if (thisArg.switching) {
        // 出场动画进行中：强制走正常路径，让它有实体。
        return callNext(false)
      }
      // ⚠️ `switching` 转 false 就是「出场结束」。
      // 国王是 GridZombie，出场播的是 `Spawn` 动画、**不走 `playDirtSpawn`** ——
      // 所以 `onDirtSpawned` 根本不会被调用，落地必须在这里判。
      restoreKingAfterSpawn(thisArg)
    }
  } catch (err) {
    noteOnce('entity', '强制实体失败：' + errText(err))
  }
  return callNext(...args)
}

/**
 * 国王出场结束：把血量上限与当前血量恢复到原值，并清掉易伤标记。
 *
 * 需求：开场把血量压低已经够体现「出场虚弱」，所以**不做易伤**；
 * 但既然开局被削，成功落地就应当回满 —— 否则等于白削一条命。
 */
function restoreKingAfterSpawn(king) {
  try {
    king.__zfaKingExposed = false
    const origT = king.__zfaKingOrigToughness
    if (typeof origT === 'number') {
      try { king.toughness = origT } catch (e) { /* 只读就跳过 */ }
      try { king.health = origT } catch (e) { /* 同上 */ }
    }
    delete king.__zfaKingOrigToughness
    stats.kingLanded += 1
    note('国王：出场结束，血量已回满至 ' + origT)
  } catch (err) {
    noteOnce('kingrestore', '国王回血失败：' + errText(err))
  }
}

/**
 * 2+5. 重金属巨人：舞台效果（Jam）期间持续扔小鬼。
 *
 * 1.1.0 挂的是 `onSmashing`，但那个方法只在 `_smash()` **末尾**被调用 ——
 * 场上没目标可砸时（也就是「空 A」）根本不触发，所以扔小鬼没发生。
 *
 * 1.2.0 改挂 `specialGargantuarUpdate`（舞台效果的每帧更新）：
 * 自己维护一个投掷间隔，只要在舞台效果里就按节奏扔，与"有没有砸到东西"无关。
 *
 * 引擎依据：
 *   · `EightiesGargantuarProps.ImpType = "eighties_imp"`
 *   · `isInJam` 为真 = 处于舞台效果期间
 *   · 基类 `GargantuarZombie` 提供 `throwImpNow()` / `haveImp`
 *   · 每次投掷前把 `haveImp` 补满即达成「无限小鬼」
 */
/* 1.2.4：扔小鬼逻辑已移除 —— 舞台效果期间改为单纯减伤 50%（见 handlerJamReduce）。 */

/**
 * 1. 脉冲黄桃：瘫痪并**强制落地**（僵王除外）。
 *
 * 引擎依据：
 *   · 基类 `Zombie.empStun` 是空函数，全引擎只有 12 处覆写；
 *     飞行僵尸里**只有 `SkyDroneZombie`** 有（内容是 `playDie()`）。
 *     ⇒ 其余四类飞机原本对脉冲黄桃完全免疫，这正是本条要补的缺口。
 *   · `flying` 是带副作用的访问器：从 true 变 false 会触发
 *     `onLanding()` → `specialZombieOnLandingForced()` —— 这就是"强制落地"。
 *   · `SkyImpZombie` 自带样例：`playSpecialZombieDieForced() { this.flying = false }`。
 *
 * 注意：僵王（`ZombossMechZombie` / `SkyZombossMechZombie`）不在目标之列。
 */
function handlerEmpDrop(entry, thisArg, args, callNext) {
  try {
    const r = callNext(...args)      // 先放行原实现（无人机在这一步就已经 playDie）
    try {
      if (thisArg && thisArg.flying === true) {
        thisArg.flying = false       // 强制落地 → onLanding() → specialZombieOnLandingForced()
        stats.empDrops += 1
      }
    } catch (e) { /* 读不到 flying 就只瘫痪、不落地 */ }
    return r
  } catch (err) {
    noteOnce('empstun', '脉冲瘫痪失败：' + errText(err))
    return callNext(...args)
  }
}

/**
 * 6. 像素僵尸：每秒扣 10 血，**无视防具**。
 *
 * 引擎依据：
 *   · `eighties_8bit` 是 ZombieEnum 值（334），没有专属引擎类 —— 只能按 ID 过滤。
 *   · `Zombie.prototype.characterUpdate` 不被任何僵尸子类覆写，
 *     是唯一每帧对所有僵尸都执行的入口。
 *   · `defaultDealDamage` 里若 `t.armorProtection` 为假，就直接扣主体 `health`、
 *     完全绕过防具 —— 这就是"无视防具"的正统写法。
 */
function handlerPixelDrain(entry, thisArg, args, callNext) {
  const r = callNext(...args)
  try {
    if (thisArg && isPixelZombie(thisArg) && !thisArg.dead) {
      const dt = Number(args[0]) || 0
      thisArg.__zfaDrain = (thisArg.__zfaDrain || 0) + dt
      while (thisArg.__zfaDrain >= 1) {
        thisArg.__zfaDrain -= 1
        selfHitIgnoreArmor(thisArg, CFG.pixelZombieSelfHitPerSec)
        stats.pixelTicks += 1
      }
    }
  } catch (err) {
    noteOnce('pixeldrain', '像素僵尸自扣血失败：' + errText(err))
  }
  return r
}

/**
 * 像素僵尸判定。
 *
 * 1.2.0 之前只看 `ID === 334`，但那依赖 ZombieEnum 的编号稳定 ——
 * 一旦对不上就整条静默失效。现在**同时**接受 ID 与 codename 两条依据。
 */
function isPixelZombie(z) {
  try {
    if (PIXEL_ZOMBIE_IDS.indexOf(z.ID) >= 0) return true
    const code = zombieCodename(z)
    return code === 'eighties_8bit'
      || code === 'eighties_8bit_armor1'
      || code === 'eighties_8bit_armor2'
  } catch (e) { return false }
}

/**
 * 直接作用于本体的**真实伤害** —— 绕开 `dealDamage` 整套流程，直接扣 `health`。
 *
 * 1.2.4：原来的写法是构造 `ZombieDamageDetails` 并把 `armorProtection` 置假，
 * 但实测**根本不掉血**（引擎的防具与减伤判定比预想的复杂）。
 * 改成直接改 `health` 的「真实伤害」：这条路径不经过任何减伤、免疫与防具判定，
 * 无论对方带什么护具都必定生效。
 *
 * 护甲一并削掉，避免出现「本体空了但护甲还在」的怪相。
 * 归零后走引擎自己的死亡入口 `playDie()`。
 */
function selfHitIgnoreArmor(z, amount) {
  try {
    if (!z || typeof z.health !== 'number') return false
    const before = z.health
    z.health = Math.max(0, before - amount)

    try {
      if (Array.isArray(z.armors) && z.armors.length
          && typeof z.armors[0].dealDamage === 'function') {
        z.armors[0].dealDamage(amount)
      }
    } catch (e) { /* 护甲处理失败不影响本体扣血 */ }

    if (z.health <= 0) {
      try {
        if (typeof z.playDie === 'function') z.playDie()
      } catch (e) { /* 死亡流程交给引擎 */ }
    }
    return z.health < before
  } catch (err) {
    noteOnce('ignorearmor', '真实伤害结算失败：' + errText(err))
    return false
  }
}

/**
 * 7. 冰河小鬼 / 冰鼬：完全免疫冰系控制。
 *
 * 引擎依据：
 *   · `Zombie.setFreeze(seconds, flag)` 是冰冻的统一下发口，内部会按
 *     `objdataOwn.ChillInsteadOfFreeze` 或 `flying` 决定走减速还是真冰冻。
 *   · `Zombie.setChill(seconds)` 是减速的下发口。
 *   · 两个入口都定义在 `Zombie.prototype` 上。
 *   ⇒ 对目标僵尸把这两个入口直接拦掉，即「完全免疫冰系」。
 */
function handlerIceImmune(entry, thisArg, args, callNext) {
  try {
    if (thisArg && ICE_IMMUNE_IDS.indexOf(thisArg.ID) >= 0) {
      stats.iceImmune += 1
      return undefined          // 拦掉 —— 不进冰冻、也不进减速
    }
  } catch (err) { /* 读不到 ID 就放行 */ }
  return callNext(...args)
}


/**
 * 10. 国王可被拦截。
 *
 * 需求：出场动画期间生成一个「隐形小鬼」，把它打死就直接拦截还没降临的国王。
 *
 * 引擎依据：
 *   · `DarkKingZombie.onLaneSpawnSettled()` 里播放 `"Spawn"` 动画 —— 这就是「降临」过程。
 *   · `DarkKingZombie.playSpecialGridZombieDieForced()` 是现成的强制终结入口（拦截用）。
 *   · 生成僵尸走 `inLnC.SpawnZombie(zombieEnum, styleEnum)`（引擎里 `bowlingInfiNut`
 *     就是这么生成护盾的），另有 `SpawnZombieByZombieType(type, style, ...)` 的写法。
 */
function handlerKingIntercept(entry, thisArg, args, callNext) {
  const r = callNext(...args)
  try {
    if (thisArg && isKingZombie(thisArg) && !thisArg.__zfaKingGuarded) {
      thisArg.__zfaKingGuarded = true
      summonKingGuardian(thisArg)
    }
  } catch (err) {
    noteOnce('kingintercept', '国王拦截：在场标记写入失败 ' + errText(err))
  }
  return r
}

/** 生成守护小鬼并挂上死亡回调；生成是异步的，失败一律降级为「不拦截」 */
function summonKingGuardian(king) {
  try {
    const lnc = king.inLnC
    if (!lnc) { note('国王拦截：拿不到 inLnC，本条不生效'); return }
    const canByType = typeof lnc.SpawnZombieByZombieType === 'function'
    const canByEnum = typeof lnc.SpawnZombie === 'function'
    if (!canByType && !canByEnum) {
      note('国王拦截：inLnC 上两种生成接口都没有，本条不生效')
      return
    }
    Promise.resolve(
      canByType
        // 1.2.4：优先用 SpawnZombieByZombieType（按 codename 生成，比枚举值可靠）
        ? lnc.SpawnZombieByZombieType(CFG.kingGuardianImpType, CFG.kingGuardianSpawnStyle,
            false, 0.5, 0, null, false, !!king.reversed, false)
        : lnc.SpawnZombie(CFG.kingGuardianImpEnum, CFG.kingGuardianSpawnStyle)
    ).then((list) => {
      const imp = list && list[0]
      if (!imp) { note('国王拦截：守护小鬼没有生成出来（返回 ' + JSON.stringify(list) + '）'); return }
      imp.__zfaKingGuardianFor = king
      king.__zfaKingGuardian = imp
      applyGhostLook(imp)
      installGuardianDeathHook(imp)
      stats.kingGuards += 1
      note(`国王拦截：已生成守护小鬼（ID ${imp.ID}，类型 ${CFG.kingGuardianImpType}）`)
    }).catch((err) => {
      note('国王拦截：小鬼生成失败 ' + errText(err))
    })
  } catch (err) {
    note('国王拦截：生成流程异常 ' + errText(err))
  }
}

/** 「隐形」只降透明度 —— 保留可见性与碰撞判定，否则玩家就打不到它了 */
function applyGhostLook(imp) {
  try {
    const a = Math.round(255 * CFG.kingGuardianOpacity)
    if (imp.node) imp.node.opacity = a
    if (imp.body && imp.body.node) imp.body.node.opacity = a
  } catch (err) { /* 拿不到节点就保持原样 */ }
}

/** 覆盖实例的死亡入口：小鬼一死就终结国王 */
function installGuardianDeathHook(imp) {
  try {
    const orig = imp.playDie
    if (typeof orig !== 'function') return
    imp.playDie = function (...a) {
      try { onKingGuardianDied(imp) } catch (e) { /* 拦截失败不影响死亡流程 */ }
      return orig.apply(this, a)
    }
  } catch (err) {
    noteOnce('kinghook', '国王拦截：小鬼死亡钩子挂载失败 ' + errText(err))
  }
}

/** 守护小鬼死亡 → 强制终结尚未降临的国王 */function onKingGuardianDied(imp) {
  try {
    if (imp && imp.__zfaGuardianResolved) return    // 同一只小鬼只结算一次
    const king = imp && imp.__zfaKingGuardianFor
    if (!king || king.dead) return
    if (imp) imp.__zfaGuardianResolved = true
    if (typeof king.playSpecialGridZombieDieForced === 'function') {
      king.playSpecialGridZombieDieForced()
      logLine(null, '国王拦截成功：守护小鬼被击杀，未降临的国王已被终结')
    } else if (typeof king.playDie === 'function') {
      king.playDie()          // 退化路径：至少让国王退场
      logLine(null, '国王拦截成功（退化路径）：国王已退场')
    } else {
      noteOnce('kingnodeath', '国王拦截：国王没有可用的终结入口')
      return
    }
    stats.kingIntercepts += 1
  } catch (err) {
    noteOnce('kingkill', '国王拦截：结算失败 ' + errText(err))
  }
}

/**
 * 2. 巨人死后在脚下留下对应世界的墓碑 / 障碍物。
 *
 * 引擎依据：
 *   · 放置障碍物走 `Square.placeTomb(laneIndex, cIndex, type, false, false, false, false)`
 *     —— 引擎里 `EightiesArcadeZombie` 就是这样生成街机柜的。
 *   · 巨人 codename 用 `Zombies.getZombieFeature(id).CODENAME` 反查。
 *   · 挂在 `GargantuarZombie.prototype.playDie` 上，21 个巨人都继承它。
 *   · 未来机甲巨人按需求除外；三个功夫铜人随机留兵器架。
 */
function handlerGargTomb(entry, thisArg, args, callNext) {
  try {
    if (thisArg && !thisArg.__zfaTombDropped) {
      thisArg.__zfaTombDropped = true      // 同一次死亡只留一次
      dropGargantuarTombstone(thisArg)
    }
  } catch (err) {
    noteOnce('gargtomb', '巨人墓碑结算失败：' + errText(err))
  }
  return callNext(...args)
}

/** 用 ID 反查僵尸 codename；拿不到返回 null（不影响原死亡流程） */
function zombieCodename(z) {
  try {
    if (!z) return null

    // 兜底优先：实例或数据上直接带 codename 的，不必依赖 engine
    if (typeof z.CODENAME === 'string' && z.CODENAME) return z.CODENAME
    if (z.objdataOwn && typeof z.objdataOwn.CODENAME === 'string') return z.objdataOwn.CODENAME
    if (z.objdataOwnOrg && typeof z.objdataOwnOrg.CODENAME === 'string') return z.objdataOwnOrg.CODENAME

    const engine = activeCtx && activeCtx.engine
    if (!engine) return null

    // 1.2.0 起改多路探测：模块路径与导出名都试一遍，避免单点失败导致整条静默失效
    for (const [modPath, exportName] of [
      ['chunks:///_virtual/Zombies.ts', 'zombies'],
      ['chunks:///_virtual/Zombies.ts', 'Zombies'],
    ]) {
      const zs = moduleExport(engine, modPath, exportName)
      if (zs && typeof zs.getZombieFeature === 'function') {
        const feat = zs.getZombieFeature(z.ID)
        if (feat && feat.CODENAME) return feat.CODENAME
      }
    }

    return null
  } catch (err) { return null }
}

/**
 * 纯查表：给定巨人 codename，决定死后该留什么。
 * 返回 null 表示「不留」（未来机甲巨人、未收录的节日系巨人）。
 */
function tombstoneFor(code) {
  if (!code || code === 'future_gargantuar') return null          // 未来机甲巨人：按需求除外
  if (KONGFU_BRONZE.indexOf(code) >= 0) {
    return KONGFU_RACKS[Math.floor(Math.random() * KONGFU_RACKS.length)]
  }
  if (code in GARG_TOMBSTONE) return GARG_TOMBSTONE[code] || FALLBACK_TOMBSTONE
  return null
}

/** 该僵尸是不是巨人 —— 引擎给巨人的实例与数据上都打了 `ZombieSort = "Gargantuar"` */
function isGargantuar(z) {
  try {
    if (!z) return false
    if (z.ZombieSort === 'Gargantuar') return true
    if (z.objdataOwn && z.objdataOwn.ZombieSort === 'Gargantuar') return true
    if (z.objdataOwnOrg && z.objdataOwnOrg.ZombieSort === 'Gargantuar') return true
    const code = zombieCodename(z)
    return !!(code && /_gargantuar$/.test(code))
  } catch (e) { return false }
}
/** 查表决定留什么，再交给引擎放置 */
function dropGargantuarTombstone(z) {
  try {
    if (!isGargantuar(z)) return false     // 非巨人直接跳过，不写日志
    const code = zombieCodename(z)
    if (!code) {
      note('巨人墓碑：拿不到 codename（ID=' + (z && z.ID) + '），本条跳过')
      return
    }
    const tomb = tombstoneFor(code)
    if (!tomb) {
      note('巨人墓碑：' + code + ' 不在对照表内（或为未来机甲巨人），跳过')
      return
    }

    const lane = z.inLnC
    if (!lane) {
      note('巨人墓碑：' + code + ' 拿不到 inLnC（车道），跳过')
      return
    }
    if (typeof lane.SpawnTomb !== 'function') {
      note('巨人墓碑：车道对象上没有 SpawnTomb，跳过')
      return
    }

    // 1.2.1：改用 `lane.SpawnTomb(type, ...)`。
    // 引擎里冲浪板 / 音响 / 功夫TNT 都是走这条路生成的
    // （`SpawnTomb` 13 处调用，`Square.placeTomb` 只有 4 处），
    // 而且它返回障碍物实例，可以直接设朝向。
    Promise.resolve(lane.SpawnTomb(tomb, false, false, false)).then((inst) => {
      if (!inst) { noteOnce('gargtombnull', '巨人墓碑：SpawnTomb 没返回实例'); return }
      try { inst.scale = z.reversed ? -1 : 1 } catch (e) { /* 设不了就保持默认 */ }
      try { inst.hypnotized = !!z.hypnotized } catch (e) { /* 同上 */ }
    }).catch((err) => {
      noteOnce('gargtombspawn', '巨人墓碑：SpawnTomb 失败 ' + errText(err))
    })
    stats.gargTombs += 1
    note(`巨人墓碑：${code} 死后留在第 ${lane.LaneIndex} 行的 ${tomb}`)
  } catch (err) {
    noteOnce('gargtombplace', '巨人墓碑：放置失败 ' + errText(err))
  }
}

/** 3. 街机游戏机：摘掉像素铁桶 + 每次召唤自扣血 */
function handlerArcade(entry, thisArg, args, callNext) {
  let flag = null
  try {
    // 召唤池挂在实例的 objdataOwn 上，直接摘掉铁桶（幂等）
    const own = thisArg && thisArg.objdataOwn
    if (own && Array.isArray(own.SummonnedZombies)) {
      const before = own.SummonnedZombies.length
      own.SummonnedZombies = own.SummonnedZombies.filter((e) => e && e.Type !== 'eighties_8bit_armor2')
      if (own.SummonnedZombies.length !== before) noteOnce('pool', '街机召唤池已摘掉像素铁桶（eighties_8bit_armor2）')
    }
  } catch (err) {
    noteOnce('poolerr', '改召唤池失败：' + errText(err))
  }
  try {
    const dt = Number(args && args[0])
    const before = Number(thisArg && thisArg.summonCD)
    flag = { dt, before }
  } catch (err) {}
  const ret = callNext(...args)
  try {
    if (flag && Number.isFinite(flag.before) && Number.isFinite(flag.dt)) {
      const after = Number(thisArg.summonCD)
      // 召唤刚发生的特征：召唤前剩余 CD 已被本帧耗完，调用后 CD 被重置成新的随机值
      if (flag.before > 0 && flag.before - flag.dt <= 1e-9 && after !== flag.before) {
        selfHit(thisArg, CFG.arcadeSummonSelfHit)
        stats.arcadeSummons += 1
      }
    }
  } catch (err) {
    noteOnce('arcadehit', '街机召唤自扣血失败：' + errText(err))
  }
  return ret
}

/** 4. 轮滑（闪耀）僵尸：被地刺一击必杀（照抄引擎里载具僵尸的写法） */
function handlerSpike(entry, thisArg, args, callNext) {
  try {
    const spikes = Array.isArray(args && args[0]) ? args[0] : []
    if (typeof thisArg.playDie === 'function') thisArg.playDie()
    for (const sw of spikes) {
      try {
        if (sw && typeof sw.normalSmash === 'function') sw.normalSmash(thisArg)
      } catch (err) {}
    }
    stats.spikeKills += 1
    return undefined
  } catch (err) {
    noteOnce('spike', '地刺秒杀失败，放行原实现：' + errText(err))
    return callNext(...args)
  }
}

/** 5. 霹雳舞：一次只踢一只僵尸；踢到之后自己掉 50 血 */
function handlerKick(entry, thisArg, args, callNext) {
  try {
    const V2 = REFS.Vec2
    const { w, h } = squareSize()
    let lane = null
    try {
      lane = thisArg.inLane
    } catch (err) {
      lane = null
    }
    if (!lane || !V2 || typeof thisArg.zombieKickable !== 'function') return callNext(...args)

    const rect = makeRect(thisArg.worldPositionX, lane.midY, 1.5 * w, h)
    const pool = thisArg.hypnotized ? lane.hypnoZombiePool() : lane.zombiePool()
    if (!Array.isArray(pool) || !rect) return callNext(...args)

    const target = pool.find((z) => z && thisArg.zombieKickable(z, rect))
    if (!target) return undefined

    const own = thisArg.objdataOwn || {}
    const dir = new V2(Number(own.KickDistance) * (thisArg.reversed ? 1 : -1), 0)
    if (typeof target.leapBy === 'function') target.leapBy(dir, true, 0.5, 40, true, false, true)
    stats.kicks += 1
    selfHit(thisArg, CFG.breakdancerKickSelfHit)
    return undefined
  } catch (err) {
    noteOnce('kick', '只踢一只的逻辑失败，放行原实现：' + errText(err))
    return callNext(...args)
  }
}

/** 6/8. 甩完麦自杀 / 扔完章鱼自扣血 */
function makeSelfHitAfter(entry) {
  return function (thisArg, args, callNext) {
    const ret = callNext(...args)
    const amount = Number(CFG[entry.hit])
    if (Number.isFinite(amount) && amount > 0) {
      const key = entry.key
      if (key === 'mcSelfKill') {
        // 自杀：只在真的活着的时候算一次
        if (!thisArg.dead) {
          selfHit(thisArg, amount)
          stats.mcSuicides += 1
        }
      } else {
        selfHit(thisArg, amount)
      }
    }
    return ret
  }
}

function handlerRotate(entry, thisArg, args, callNext) {
  const ret = callNext(...args)
  try {
    const dt = Number(args && args[0])
    if (dt > 0 && thisArg.rotating) {
      selfHit(thisArg, CFG.jesterRotateSelfHitPerSec * dt)
      stats.rotateTicks += 1
    }
  } catch (err) {
    noteOnce('rotate', '旋转掉血失败：' + errText(err))
  }
  return ret
}

/* ────────────────────── 1.4.0：四条新特性 ────────────────────── */

/** codename 是否在名单里（小写比较，容忍 null / 非僵尸对象） */
function codenameInList(z, list) {
  const cn = zombieCodename(z)
  if (!cn) return false
  return list.indexOf(String(cn).toLowerCase()) >= 0
}

/** 取本行所有植物与僵尸的引用集合（_smash 前后各取一次） */
function poolSnapshot(z) {
  const set = new Set()
  try {
    const lane = z && z.inLane
    if (!lane) return null
    const plants = typeof lane.plantPool === 'function' ? lane.plantPool() : null
    const zombies = typeof lane.zombiePool === 'function' ? lane.zombiePool() : null
    if (Array.isArray(plants)) for (const p of plants) set.add(p)
    if (Array.isArray(zombies)) for (const q of zombies) set.add(q)
  } catch (err) {
    return null
  }
  return set
}

/** 直接加血（不走伤害管线，避免负伤害被各种减伤/免疫判定吃掉） */
function healZombie(z, amount) {
  try {
    const cur = typeof z.health === 'number' ? z.health : null
    if (cur == null) return 0
    const max = typeof z.toughness === 'number' ? z.toughness : null
    const next = max == null ? cur + amount : Math.min(max, cur + amount)
    const gained = Math.max(0, next - cur)
    z.health = next
    try {
      if (typeof z.setDisplay === 'function') z.setDisplay()
      else if (typeof z.updateHealthBar === 'function') z.updateHealthBar()
    } catch (e) {}
    if (gained > 0) {
      stats.gargHeals += 1
      stats.gargHealHp += gained
    }
    return gained
  } catch (err) {
    noteOnce('heal', '回血失败：' + errText(err))
    return 0
  }
}

/**
 * 1. 黑暗巨尸：击杀任何单位回 900 血。
 *
 * `_smash` 一次只处理 1 植物 + 1 僵尸（墓碑与粘液也是这里分派），
 * 所以「调用前后从池子里消失的对象」就是本次击杀 —— O(1) 判定，不必扫全场。
 * 被魅惑时植物分支会被跳过、只砸僵尸，与「植物或僵尸都算」天然一致。
 */
/** 当前正在执行 _smash 的巨尸（同步窗口）。击杀捕获只在它非空时计数。 */
let smashCtx = null

/**
 * 1. 黑暗巨尸：击杀任何单位回 900 血。
 *
 * 1.4.0 的写法有两个坑，1.4.1 全部修掉：
 *  ① 原来用 `codenameInList(thisArg, ['dark_gargantuar'])` 判身份 —— 而 `zombieCodename()`
 *     运行时要去 engine 查僵尸表，**startup 之后 engine 访问已关闭**，返回 null，
 *     于是整条判定恒为 false，一次都没生效（就是「击杀后没回血」的真正原因）。
 *     现在不再判身份：钩子挂在 `DarkGargantuarZombie.prototype._smash` 上，
 *     本来就只有这一种巨人会走进来。
 *  ② 原来只靠「行内植物/僵尸池的前后快照」判击杀 —— 但植物被砸死时还在播死亡动画，
 *     池子里仍占着位置，前后对比等于没变化。
 *
 * 现在改成双保险：主路是击杀捕获（包 `Plant.kill` / `Zombie.playDie`，
 * 只在下面这个 `smashCtx` 非空的同步窗口里计数），兜底才是池快照。
 */
function handlerGargHeal(entry, thisArg, args, callNext) {
  const before = poolSnapshot(thisArg)
  const prev = smashCtx
  const box = { z: thisArg, kills: 0 }
  smashCtx = box
  let r
  try {
    r = callNext(...args)
  } finally {
    smashCtx = prev
  }

  // 兜底：击杀捕获一次都没响（例如 kill/playDie 没挂上），但池子里确实少了东西
  if (!box.kills && before) {
    try {
      const after = poolSnapshot(thisArg)
      if (after) {
        let n = 0
        for (const o of before) if (!after.has(o)) n += 1
        if (n > 0) {
          box.kills = n
          healZombie(thisArg, n * CFG.gargKillHeal)
          noteOnce('gargHealFallback', '回血走了池快照兜底（击杀捕获未触发）')
        }
      }
    } catch (err) {
      noteOnce('gargHeal', '黑暗巨尸回血兜底判定失败：' + errText(err))
    }
  }
  return r
}

/**
 * 击杀捕获：`Plant.kill` / `Zombie.playDie` 都会经过这里。
 * 只有「某只巨尸正在 _smash」的那一瞬才计数 —— 僵尸啃植物、其它死因一律不触发。
 */
function handlerVictimKill(entry, thisArg, args, callNext) {
  const r = callNext(...args)
  try {
    const c = smashCtx
    if (c && c.z) {
      c.kills += 1
      healZombie(c.z, CFG.gargKillHeal)
    }
  } catch (err) {
    noteOnce('victimKill', '击杀捕获失败：' + errText(err))
  }
  return r
}

/** 改弹体伤害（原函数本就用 setDamage 改，照同一手法） */
function scaleProjectile(prj, mul) {
  try {
    const dmg = typeof prj.damage === 'number' ? prj.damage : null
    if (dmg != null) {
      if (typeof prj.setDamage === 'function') prj.setDamage(dmg * mul)
      else prj.damage = dmg * mul
    }
  } catch (err) {}
  try {
    if (Array.isArray(prj.splashDamages)) {
      prj.splashDamages = prj.splashDamages.map((v) => (typeof v === 'number' ? v * mul : v))
    }
  } catch (err) {}
}

/** 把纸制防具当场清零 —— 之后的伤害自然打到本体 */
function zeroPaper(z) {
  try {
    let touched = false
    if (typeof z._paperHealth === 'number' && z._paperHealth > 0) {
      z._paperHealth = 0
      touched = true
    }
    if (typeof z.paperHealth === 'number' && z.paperHealth > 0) {
      z.paperHealth = 0
      touched = true
    }
    if (touched) {
      stats.paperBypasses += 1
      try {
        if (typeof z.playPaperDestroy === 'function') z.playPaperDestroy()
      } catch (e) {}
    }
    return touched
  } catch (err) {
    return false
  }
}

/**
 * 2. 投手砸中被点名僵尸 → 伤害 ×4（模拟被投手直接爆头）。
 * 顺手处理二类防具的「投掷」那一条：纸制品被投掷物砸中，纸当场报废。
 */
function handlerLobHeadshot(entry, thisArg, args, callNext) {
  const p = callNext(...args)
  if (!p || typeof p.then !== 'function') return p
  return p.then((prj) => {
    try {
      const target = args[0] || (prj && prj.targetLocked)
      if (prj && idInList(target, HEADSHOT_TARGET_IDS, HEADSHOT_TARGETS)) {
        scaleProjectile(prj, CFG.lobberHeadshotMult)
        stats.lobHeadshots += 1
      }
      if (idInList(target, PAPER_TARGET_IDS, PAPER_TARGETS)) zeroPaper(target)
    } catch (err) {
      noteOnce('lobHead', '投手爆头判定失败：' + errText(err))
    }
    return prj
  })
}

/** 电击的 damageType 枚举值（拿不到引擎枚举时按引擎里的 electricity = 2） */
function electricityType() {
  try {
    const T = REFS.ZombieDamageType
    if (T && typeof T.electricity === 'number') return T.electricity
  } catch (err) {}
  return 2
}

/** 关掉「由护甲挡」的标记：伤害直接进本体 */
function withoutArmorProtection(details) {
  try {
    if (!details) return details
    if (typeof details.replaceArmorProtction === 'function') return details.replaceArmorProtction(false)
    if (typeof details.replaceArmorProtection === 'function') return details.replaceArmorProtection(false)
    details.armorProtection = false
  } catch (err) {}
  return details
}

/** 3. 二类防具·电击：报纸护甲层只吃 armorProtection=true 的伤害 */
/**
 * 2'. 投掷弹命中结算（1.4.3）：本体与溅射一起放大，纸防具直接清掉。
 *
 * `dealDamageToZombie(zombie, splashAlso, details, particles)` 内部是
 * `i || (i = new SplashDamage(this.damage, …))` —— 只要在调用窗口里改 `this.damage`，
 * 本体伤害与 `dealSplashDamage` 会一起乘上去，不需要自己造 details（那个构造有 15 个参数）。
 * 判「投掷物」用 `gravity > 0`：投手弹走抛物线，普通直线弹是 0。
 */
function handlerLobHit(entry, thisArg, args, callNext) {
  const target = args[0]
  const prj = thisArg
  let restore = null
  try {
    const isLob = !!(prj && typeof prj.gravity === 'number' && prj.gravity > 0)
    if (isLob && target && typeof target === 'object') {
      const head = idInList(target, HEADSHOT_TARGET_IDS, HEADSHOT_TARGETS)
      const paper = idInList(target, PAPER_TARGET_IDS, PAPER_TARGETS)

      // 1.4.4：不要再把纸一键清零（那等于「一下摧毁报纸」）。
      // 改成打一个「本次伤害穿透护甲」的瞬时标记，由报纸自己的 dealDamage 消费，
      // 报纸本身保留 —— 这才是「绕开防具」，不是「拆掉防具」。
      if (paper) {
        try { target.__zfaLobBypass = true } catch (err) {}
      }

      if (head) {
        const orig = prj.damage
        if (typeof orig === 'number' && orig > 0) {
          prj.damage = orig * CFG.lobberHeadshotMult
          restore = orig
          stats.lobHeadshots += 1
        }
      }
    }
  } catch (err) {
    noteOnce('lobHit', '投掷命中处理失败：' + errText(err))
  }
  try {
    return callNext(...args)
  } finally {
    if (restore != null) {
      try { prj.damage = restore } catch (err) {}
    }
    try { if (target && target.__zfaLobBypass) target.__zfaLobBypass = false } catch (err) {}
  }
}

function handlerPaperBypass(entry, thisArg, args, callNext) {
  try {
    if (idInList(thisArg, PAPER_TARGET_IDS, PAPER_TARGETS)) {
      const d = args[0]
      const lobbed = !!(thisArg && thisArg.__zfaLobBypass)
      if (d && (lobbed || d.damageType === electricityType())) {
        args[0] = withoutArmorProtection(d)
        stats.paperBypasses += 1
      }
    }
  } catch (err) {
    noteOnce('paperElec', '二类防具（电击/投掷）判定失败：' + errText(err))
  }
  return callNext(...args)
}

/** 3'. 二类防具·地刺：PrjFunctions.stabOnZombie 的 details 默认 armorProtection=true */
function installSpikeBypass(ctx) {
  const hooks = ctx && ctx.unsafe && ctx.unsafe.hooks
  const pf = REFS.PrjFunctions
  if (!hooks || typeof hooks.wrapMethod !== 'function') return 0
  if (!pf || typeof pf.stabOnZombie !== 'function') {
    note('地刺入口不可用（PrjFunctions.stabOnZombie 缺失），二类防具只生效电击与投掷两条')
    return 0
  }
  try {
    hooks.wrapMethod({
      target: pf,
      methodName: 'stabOnZombie',
      handler: ({ args, callNext }) => {
        try {
          const z = args[0]
          if (idInList(z, PAPER_TARGET_IDS, PAPER_TARGETS)) {
            for (let i = 0; i < args.length; i++) {
              const a = args[i]
              if (a && typeof a === 'object' && 'armorProtection' in a) {
                args[i] = withoutArmorProtection(a)
                stats.paperBypasses += 1
                break
              }
            }
          }
        } catch (err) {
          noteOnce('spikeBypass', '二类防具（地刺）判定失败：' + errText(err))
        }
        return callNext(...args)
      },
    })
    note('地刺入口已挂载（PrjFunctions.stabOnZombie）')
    return 1
  } catch (err) {
    note('地刺挂载失败：' + errText(err))
    return 0
  }
}

/** 把僵尸整体往前拽一格（世界坐标 setter，引擎每帧 judgeInLnC 会重算格子） */
function moveSelfForward(z, squares) {
  try {
    const { w } = squareSize()
    const dir = z.reversed ? 1 : -1 // 僵尸从右往左走，前进 = x 减小
    const delta = dir * w * squares
    if (typeof z.worldPositionX === 'number') z.worldPositionX += delta
    else if (z.worldPosition && typeof z.worldPosition.x === 'number') z.worldPosition.x += delta
    return true
  } catch (err) {
    noteOnce('fisherMove', '渔夫前进失败：' + errText(err))
    return false
  }
}

/** 掷骰：返回 { taken, ret }；taken=false 表示这次按原样拉植物 */
function fisherRoll(hook, plant) {
  const owner = hook && hook.owner
  if (!owner) return { taken: false }
  stats.fisherRolls += 1
  let roll = Math.random()

  if (roll < CFG.fisherForwardChance) {
    moveSelfForward(owner, CFG.fisherForwardSquares)
    stats.fisherForward += 1
    return { taken: true, ret: 0 }
  }
  roll -= CFG.fisherForwardChance

  if (roll < CFG.fisherSelfHitChance) {
    selfHit(owner, CFG.fisherSelfHitDamage)
    stats.fisherSelfHits += 1
    return { taken: true, ret: 0 }
  }
  roll -= CFG.fisherSelfHitChance

  if (roll < CFG.fisherNothingChance) {
    stats.fisherIdle += 1
    return { taken: true, ret: 0 }
  }
  return { taken: false }
}

/**
 * 给这只僵尸当前的钩子实例打补丁（实例级，一次性）。
 * 为什么不用类：`hookCall` 定义在一个没有 ccclass 注册的内部 hook 类上，
 * `getClassByName` / `getModuleExport` 都拿不到它；而引擎在 `_shoot` 里把实例挂到
 * `zombie.hookShot`，所以只能从实例这一侧接入。钩子会被重建，所以每帧看一眼。
 */
function patchFisherHook(z) {
  try {
    const h = z && z.hookShot
    if (!h || h.__zfaFisher || typeof h.hookCall !== 'function') return false
    const orig = h.hookCall
    h.__zfaFisher = true
    h.hookCall = function (plant, zombie, tomb) {
      // 空调用（目标离开草坪 / 停用）不掷骰，交给原实现
      if (!plant) return orig.apply(this, arguments)
      const r = fisherRoll(this, plant)
      if (r.taken) return r.ret
      return orig.apply(this, arguments)
    }
    noteOnce('fisherPatch', '渔夫钩子已接上抽奖逻辑（实例级补丁）')
    return true
  } catch (err) {
    noteOnce('fisherPatchErr', '渔夫钩子打补丁失败：' + errText(err))
    return false
  }
}

function handlerFisherPatch(entry, thisArg, args, callNext) {
  const r = callNext(...args)
  try {
    patchFisherHook(thisArg)
  } catch (err) {}
  return r
}

/**
 * 4. 渔夫僵尸：拉植物改成抽奖。
 *   10% 把自己往前拽一格 / 20% 用力过猛自扣 100 / 20% 完全没反应 / 其余照常拉植物。
 * 空调用（args[0] 为空 = 目标离开草坪或 specialOnDisable）不掷骰。
 */
function handlerFisherGamble(entry, thisArg, args, callNext) {
  const plant = args[0]
  if (!plant) return callNext(...args)
  const owner = (thisArg && thisArg.owner) || null
  if (!owner) return callNext(...args)

  stats.fisherRolls += 1
  let roll = Math.random()

  if (roll < CFG.fisherForwardChance) {
    moveSelfForward(owner, CFG.fisherForwardSquares)
    stats.fisherForward += 1
    return 0
  }
  roll -= CFG.fisherForwardChance

  if (roll < CFG.fisherSelfHitChance) {
    selfHit(owner, CFG.fisherSelfHitDamage)
    stats.fisherSelfHits += 1
    return 0
  }
  roll -= CFG.fisherSelfHitChance

  if (roll < CFG.fisherNothingChance) {
    stats.fisherIdle += 1
    return 0
  }
  return callNext(...args)
}

function makeHandler(entry) {
  return function ({ thisArg, args, callNext }) {
    try {
      switch (entry.mode) {
        case 'jamReduce':
          return handlerJamReduce(entry, thisArg, args, callNext)
        case 'empDrop':
          return handlerEmpDrop(entry, thisArg, args, callNext)
        case 'pixelDrain':
          return handlerPixelDrain(entry, thisArg, args, callNext)
        case 'iceImmune':
          return handlerIceImmune(entry, thisArg, args, callNext)
        case 'muteAoe':
          return handlerMuteAoe(entry, thisArg, args, callNext)
        case 'kingExpose':
          return handlerKingExpose(entry, thisArg, args, callNext)
        case 'kingKnight':
          return handlerKingKnight(entry, thisArg, args, callNext)
        case 'entityForce':
          return handlerEntityForce(entry, thisArg, args, callNext)
        case 'gargTomb':
          return handlerGargTomb(entry, thisArg, args, callNext)
        case 'arcade':
          return handlerArcade(entry, thisArg, args, callNext)
        case 'spike':
          return handlerSpike(entry, thisArg, args, callNext)
        case 'kick':
          return handlerKick(entry, thisArg, args, callNext)
        case 'selfHitAfter':
          return makeSelfHitAfter(entry)(thisArg, args, callNext)
        case 'rotate':
          return handlerRotate(entry, thisArg, args, callNext)
        case 'gargHeal':
          return handlerGargHeal(entry, thisArg, args, callNext)
        case 'lobHeadshot':
          return handlerLobHeadshot(entry, thisArg, args, callNext)
        case 'lobHit':
          return handlerLobHit(entry, thisArg, args, callNext)
        case 'paperBypass':
          return handlerPaperBypass(entry, thisArg, args, callNext)
        case 'victimKill':
          return handlerVictimKill(entry, thisArg, args, callNext)
        case 'fisherPatch':
          return handlerFisherPatch(entry, thisArg, args, callNext)
        case 'fisherGamble':
          return handlerFisherGamble(entry, thisArg, args, callNext)
        default:
          return callNext(...args)
      }
    } catch (err) {
      noteOnce('h:' + entry.label, entry.label + ' 钩子异常（已放行原实现）：' + errText(err))
      return callNext(...args)
    }
  }
}

/** 继承来的方法先固化成自有属性，避免包装时连累父类 */
function materializeInherited(target, methodName) {
  try {
    if (Object.prototype.hasOwnProperty.call(target, methodName)) return
    const inherited = target[methodName]
    if (typeof inherited !== 'function') return
    target[methodName] = function (...a) {
      return inherited.apply(this, a)
    }
  } catch (err) {}
}

function installHook(ctx, entry, cls) {
  const hooks = ctx.unsafe && ctx.unsafe.hooks
  const proto = cls.prototype
  const methods = entry.methods && entry.methods.length ? entry.methods : [entry.method]
  let mounted = 0
  for (const method of methods) {
    if (typeof proto[method] !== 'function') {
      noteOnce('nom:' + entry.names[0] + ':' + method, entry.label + ': 原型上没有 ' + method)
      continue
    }
    // 继承来的方法先固化成自有属性，避免包装时连累父类
    materializeInherited(proto, method)

    if (hooks && typeof hooks.wrapMethod === 'function') {
      try {
        hooks.wrapMethod({ target: proto, methodName: method, handler: makeHandler(entry) })
        mounted += 1
        continue
      } catch (err) {
        noteOnce('wrap:' + method, entry.label + '.' + method + ': wrapMethod 抛错，改用直接包装 ' + errText(err))
      }
    }
    try {
      const orig = proto[method]
      const handler = makeHandler(entry)
      proto[method] = function (...a) {
        return handler({ thisArg: this, args: a, callNext: (...x) => orig.apply(this, x) })
      }
      noteOnce('directwrap', entry.label + ': 使用直接包装（未走 hooks.wrapMethod）')
      mounted += 1
    } catch (err) {
      note(entry.label + '.' + method + ': 直接包装失败 ' + errText(err))
    }
  }
  return mounted
}

/* ────────────────────── 面板 / 诊断 ────────────────────── */
function describeStats() {
  return [
    `舞台效果减伤 ${stats.jamReduced}`,
    `街机召唤 ${stats.arcadeSummons}`,
    `地刺秒杀 ${stats.spikeKills}`,
    `踢击 ${stats.kicks}`,
    `自杀/自扣 ${stats.selfHits}`,
  ].join(' · ')
}

function dumpDiagnostics(ctx) {
  ctx.log.info('[僵尸调整] ---- 诊断 ----')
  for (let i = 0; i < diagLines.length; i++) ctx.log.info('[僵尸调整] ' + diagLines[i])
  ctx.log.info('[僵尸调整] 统计：' + describeStats())
  ctx.log.info('[僵尸调整] ---- 诊断结束 ----')
}

function definePanel(ctx) {
  try {
    ctx.controls.definePanel({
      title: '妙趣横生的僵尸调整',
      description: '十条僵尸体验改动。小鬼血量为数据改动（重启即生效），其余九条在运行期生效。',
      groups: [
        {
          title: '挂载状态',
          items: TARGETS.map((t) => ({
            type: 'readonly',
            key: 'hook-' + t.mode + '-' + t.names[0],
            label: t.label + '（' + t.names[0] + '）',
            getValue: () => {
              const r = resolved.get(t.names[0])
              if (!r) return '未定位到类'
              const total = (t.methods || [t.method]).length
              if (!r.mounted) return '定位到类，但一个方法都没挂上'
              return `已挂载 ${r.mounted}/${total} 个入口` + (r.mounted < total ? '（部分入口缺失）' : '')
            },
          })),
        },
        {
          title: '触发统计',
          items: [
            { type: 'readonly', key: 'stats', label: '累计', getValue: () => describeStats() },
            {
              type: 'readonly',
              key: 'cfg',
              label: '可调数值',
              getValue: () =>
                `街机召唤自扣 ${CFG.arcadeSummonSelfHit} · 踢击自扣 ${CFG.breakdancerKickSelfHit} · 章鱼自扣 ${CFG.octopusThrowSelfHit} · 弄臣 ${CFG.jesterRotateSelfHitPerSec}/秒`,
            },
          ],
        },
        {
          title: '操作',
          items: [
            {
              type: 'action',
              key: 'diag',
              label: '输出诊断到日志',
              onClick: () => {
                dumpDiagnostics(ctx)
                ctx.ui.toast('诊断已写入日志', 'info')
              },
            },
            {
              type: 'action',
              key: 'reset',
              label: '清零统计',
              onClick: () => {
                for (const k of Object.keys(stats)) stats[k] = 0
                ctx.ui.toast('统计已清零', 'info')
              },
            },
          ],
        },
      ],
    })
  } catch (err) {
    ctx.log.warn('[僵尸调整] 面板创建失败：' + errText(err))
  }
}

/* ────────────────────── 生命周期 ────────────────────── */
export default {
  startup(ctx) {
    try {
      activeCtx = ctx || activeCtx
      if (!ctx || !ctx.engine) {
        note('startup: ctx.engine 不可用')
        return
      }
      resolveEngineRefs(ctx.engine, ctx)
      let found = 0
      for (const entry of TARGETS) {
        const methods = entry.methods && entry.methods.length ? entry.methods : [entry.method]
        const loc = locateClass(ctx.engine, entry.names, entry.module, methods[0])
        if (loc) {
          resolved.set(entry.names[0], { cls: loc.cls, how: loc.how, entry, methods, mounted: 0 })
          found += 1
          logLine(ctx, `定位 ${entry.names[0]}（${loc.how}）→ 待挂 ${methods.join(' + ')}`)
        } else {
          note(entry.label + '（' + entry.names[0] + '）未定位到类')
          logLine(ctx, `✗ 未定位到类：${entry.label}（候选名 ${entry.names.join(' / ')}）`)
        }
      }
      ctx.log.info(`[僵尸调整] startup 定位 ${found}/${TARGETS.length} 个僵尸类`)
      if (found < TARGETS.length) dumpDiagnostics(ctx)
    } catch (err) {
      note('startup 顶层异常: ' + errText(err))
      try {
        ctx.log.error('[僵尸调整] startup 异常：' + errText(err))
        dumpDiagnostics(ctx)
      } catch (inner) {}
    }
  },

  setup(ctx) {
    try {
      activeCtx = ctx || activeCtx
      if (!ctx || !ctx.unsafe || !ctx.unsafe.hooks || typeof ctx.unsafe.hooks.wrapMethod !== 'function') {
        note('setup: 没有可用的 unsafe.hooks.wrapMethod')
        dumpDiagnostics(ctx)
        return
      }
      let hooked = 0
      let methodTotal = 0
      const failed = []
      for (const entry of TARGETS) {
        const rec = resolved.get(entry.names[0])
        if (!rec) {
          failed.push(entry.label + '（未定位）')
          continue
        }
        try {
          const m = installHook(ctx, entry, rec.cls)
          rec.mounted = m
          if (m > 0) {
            hooked += 1
            methodTotal += m
            logLine(ctx, `✓ 已挂载 ${entry.names[0]} → ${(entry.methods || [entry.method]).join(' + ')}（成功 ${m} 个入口）`)
          } else {
            failed.push(entry.label + '（一个入口都没挂上）')
            logLine(ctx, `✗ 挂载失败：${entry.label}（${entry.names[0]}）`)
          }
        } catch (err) {
          note(entry.label + ' 挂载抛错 ' + errText(err))
          failed.push(entry.label + '（抛错）')
        }
      }
      ctx.log.info(`[僵尸调整] 已挂载 ${hooked}/${TARGETS.length} 个僵尸类（共 ${methodTotal} 个方法入口）`)
      if (failed.length) note('未挂载：' + failed.join('、'))

      // 1.4.0：地刺那条走 PrjFunctions（工具对象，不是类），单独挂
      const spikeMounted = installSpikeBypass(ctx)
      if (spikeMounted) methodTotal += 1

      if (hooked === 0) {
        dumpDiagnostics(ctx)
        ctx.ui.toast('僵尸调整：钩子全部挂载失败（详见日志）', 'error')
        return
      }
      ctx.ui.toast(`僵尸调整已生效（${hooked}/${TARGETS.length} 个僵尸类）`, 'success')
      definePanel(ctx)
    } catch (err) {
      try {
        ctx.log.error('[僵尸调整] setup 异常：' + errText(err))
        dumpDiagnostics(ctx)
      } catch (inner) {}
    }
  },
}

// 供模拟测试读取内部状态（游戏内不会用到这些导出）
export const __test__ = {
  CFG,
  TARGETS,
  stats,
  resolved,
  /** 重新挂载一次（测试里重置用） */
  resetRuntime() {
    for (const k of Object.keys(stats)) stats[k] = 0
    resolved.clear()
    notedOnce.clear()
    diagLines.length = 0
  },
  makeHandler,
  installHook,
  locateClass,
  handlerJamReduce,
  isInJamNow,
  handlerEmpDrop,
  handlerPixelDrain,
  handlerIceImmune,
  handlerKingIntercept,
  summonKingGuardian,
  onKingGuardianDied,
  applyGhostLook,
  installGuardianDeathHook,
  isKingZombie,
  zombieCodename,
  selfHitIgnoreArmor,
  PIXEL_ZOMBIE_IDS,
  handlerMuteAoe,
  handlerKingExpose,
  restoreKingAfterSpawn,
  handlerKingKnight,
  restoreKingAfterSpawn,
  handlerEntityForce,
  isKingZombie,
  ICE_IMMUNE_IDS,
  handlerArcade,
  handlerSpike,
  handlerKick,
  handlerRotate,
  makeSelfHitAfter,
  selfHit,
  handlerGargHeal,
  handlerVictimKill,
  handlerLobHeadshot,
  handlerPaperBypass,
  handlerLobHit,
  handlerFisherGamble,
  handlerFisherPatch,
  fisherRoll,
  patchFisherHook,
  installSpikeBypass,
  healZombie,
  scaleProjectile,
  zeroPaper,
  codenameInList,
  moveSelfForward,
  HEADSHOT_TARGETS,
  PAPER_TARGETS,
  HEADSHOT_TARGET_IDS,
  PAPER_TARGET_IDS,
  idInList,
  setRefs(refs) { Object.assign(REFS, refs || {}) },
  getRefs() { return REFS },
  getDiag() { return diagLines.slice() },
}
