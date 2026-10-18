# 更新日志

本文件记录本模组的所有重要变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [1.4.3] - 2026-10-18

### 修复

- **投掷 4 倍与绕纸仍然不生效**。1.4.2 把身份判定换成 ID 了，但拦截点还在
  `CabbagePultPlant._lobToZombie` —— 那是个编译后的生成器方法，按 ccclass 拿类再挂它并不可靠。
  1.4.3 换到**所有弹体命中的必经之路** `commonShot.prototype.dealDamageToZombie`：

  - 判「投掷物」用 `gravity > 0`（投手弹走抛物线，直线弹是 0），不依赖任何数据标记；
  - 命中爆头名单（ZombieEnum ID）时，在调用窗口里把 `this.damage` 临时乘 4 ——
    该函数内部是 `new SplashDamage(this.damage, …)`，所以本体与溅射会一起放大，调用结束后还原；
  - 命中二类防具（读报 17 / 周刊 18 / 骆驼 78、79）时先把 `paperHealth` 清零，
    本次伤害就绕过纸直接进本体（只清纸，不额外加伤）。

### 说明

- 1.4.0 → 1.4.3 四轮修复暴露的是同一个设计错误：**依赖运行期拿不到的 codename、或依赖按名字挂载生成器方法**。
  现在的规矩：身份用 ZombieEnum 数字，行为钩子只挂「一定会被调用的公共方法」。
## [1.4.2] - 2026-10-18

### 修复

- **投手 4 倍伤害不生效、投掷不绕纸**。同一病根：`codenameInList()` 依赖 `zombieCodename()`，
  运行期 engine 已关闭 → 恒为 null。现改用 **ZombieEnum 数字 ID** 判身份，数字取自 0.15.0 引擎枚举并逐个核对：

  | 用途 | ID |
  |---|---|
  | 爆头名单 | future_gargantuar 174 · catapult 23 · zomboni 22 · sky_twin 365 · twin_upper 363 · twin_lower 364 · airraid_twin 366 |
  | 二类防具 | modern_newspaper 17 · newspaper_veteran 18 · camel_segment 78 · camel_onehump 79 |

  `idInList(z, ids, names)` 优先用 `z.ID`；只有拿不到 ID 时才退回 codename（那条路仍可能失效，但不再抛错）。
  投掷绕纸在 `_lobToZombie` 命中时把 `paperHealth` 清零，现在也按 ID 判定。

### 说明

- `_lobToZombie` 是编译后的生成器函数（返回 Promise），4 倍通过 `.then` 改弹体伤害与溅射 —— 与引擎自己的 `setDamage` 同款。
- 1.4.0~1.4.1 的三处失效全是同一类错误：**用运行期拿不到的 codename 判身份**。这类判定现在统一走 ID。
## [1.4.1] - 2026-10-18

### 修复

- **黑暗巨尸击杀不回血**。根因是身份判定：`codenameInList(thisArg, ['dark_gargantuar'])` 依赖
  `zombieCodename()`，而它运行时要去 engine 查僵尸表 —— **startup 之后引擎访问已关闭**，返回 null，
  整条判定恒为 false。现在不再判身份（钩子本来就只挂在 `DarkGargantuarZombie.prototype._smash` 上），
  并把「判击杀」的主路从池快照换成**击杀捕获**：包 `Plant.kill` / `Zombie.playDie`，
  用 `smashCtx` 限定只在巨尸这一锤的同步窗口内计数（植物死亡时还在播动画、池子里仍占位，快照法本来就统计不到）。
  池快照降为兜底。
- **渔夫抽奖不生效**。`hookCall` 属于一个**没有 ccclass 注册的内部 hook 类**，
  `getClassByName` / `getModuleExport` 都拿不到它，原来按 `BeachFisherHook` 定位必然失败。
  现在改为每帧从 `zombie.hookShot` 取钩子实例、给它的 `hookCall` 打一次性实例级补丁（钩子会重建，所以每帧看）。
- **报纸周年版类名不存在**：`ModernNewspaperVeteranZombie` 在引擎里查不到，已从候选里去掉，
  只挂 `ModernNewspaperZombie`（两个版本共用同一个类）。

### 说明

- 这三个 bug 是同一类：**按「报告里推测的类名」挂钩子**，名字不对就整条静默失效。
  1.4.1 已按引擎里的 ccclass 注册名逐个核准（`BeachFisherZombie` / `ModernNewspaperZombie` /
  `CabbagePultPlant` / `DarkGargantuarZombie` / `Plant` / `Zombie`）。
## [1.4.0] - 2026-10-18

### 新增

- **黑暗巨尸：击杀任何单位回 900 血**。包 `GargantuarZombie.prototype._smash`（巨人唯一伤害出口）做前后存活快照；
  植物、僵尸、自己扔出的僧侣小鬼都算。图鉴按「诺克萨斯断头台」重写。
- **投手爆头 ×4**：`future_gargantuar` / `catapult` / `zomboni` / `sky_twin`（含 upper/lower）被投手类植物砸中伤害 ×4。
  实现包 `CabbagePultPlant.prototype._lobToZombie`，命中匹配后 `setDamage(damage*4)` + splash ×4。
- **二类防具**：`newspaper` / `newspaper_veteran` / `camel_*` 的地刺、电击、投掷伤害绕过纸层直击本体。
  电击走 `dealDamage` 里关 `armorProtection`；地刺包 `PrjFunctions.stabOnZombie`；投掷命中时清零 `paperHealth`。
- **渔夫僵尸抽奖**：10% 自己前进一格 / 20% 自扣 100 / 20% 无反应 / 50% 照旧拉植物。
- **青骷髅头改名「老爹（Uncle）」** + 图鉴按《成龙历险记》老爹梗重写。
- 图鉴新增 10 条（现共 43 条），全部由 WorkBuddy 按统一 brief 产出。

### 说明

- 已证伪的前提：巨人 `throwImp` 全程不发伤害，扔小鬼**不会**杀僵尸 —— 击杀只可能来自那一锤。
- 投手弹在数据层没有投掷标记，僵尸侧无法辨来源，所以 4 倍只能从投手侧改。
- 「冰车」按造冰车僵尸（`zomboni`）实现；若要改成雪橇队（`bobsled`），改 `HEADSHOT_TARGETS` 一行即可。
## [1.3.0] - 2026-10-18

### 新增

- **武林三巨头改名**（功夫世界，`jsons/features/ZombieFeatures.json`）：

  | 原 | 新 | 梗 |
  |---|---|---|
  | 火药魔头 Devil of Dynamite | **万户 Wan Hu** | 明代万户，人类第一个想靠火箭上天的人 |
  | 持刀大侠 Blade-Wielding Hero | **李逵 Li Kui** | 水浒黑旋风，两把板斧 |
  | 气功教主 Qigong Master | **张角 Zhang Jiao** | 黄巾起义，「苍天已死，黄天当立」 |

  三者的「三把手 / 二把手 / 一把手」层级关系原样保留，只是换了履历。
  `kongfu_boss_chi` 的图鉴与 `KONGFU_INTRO_BOSS3` 出场剧情都写了那八个字。

- **图鉴按「宝开语」重写**（`jsons/objects/ZombieAlmanac.json`，33 条）：
  - 18 只被改动过行为的僵尸（三巨头 + 国王/亚瑟王 + 弄臣 + 章鱼 + 蜻蜓 + 雪人小鬼 +
    宝藏雪人 + 闪耀 + 麦克 + 霹雳舞 + 像素 + 重金属巨尸 + 战斗机 + 无人机工程师 + 伞兵小鬼），
    `Introduction` / `Special` / `Chat` 整条重写，`Special` 里新增一条说明这次动了什么。
  - 原作里已经不成立的描述被删掉（例如重金属巨尸的「音波斩」条目 —— 1.2.5 起就没这个功能了）。
  - 17 只小鬼在各自 `Special` 末尾追加一句档案，讲的是「变脆」这件事。
    其中 15 只单独出条目，雪人小鬼与伞兵小鬼**并进上面重写后的那条**——
    同一 codename 生成两个对象会让后者覆盖前者（本次校对抓到的坑，已修）。
  - 足球小鬼（`sportzball_imp`）在 `ZombieAlmanac` 里没有条目，档案只存在于数据层，不写图鉴。

- **功夫世界三段剧情同步换名**（`jsons/objects/NarrativeList.json`）：
  `KONGFU_INTRO_BOSS2`（万户）、`KONGFU_INTRO_BOSS3`（张角）、`KONGFU_OUTRO_BOSS2`（李逵）。

### 说明

- 文案由 WorkBuddy 按统一 brief 产出，schema 校验与合并由主 agent 完成；
  双语（中/英）成对写入，英文按 PopCap 原文腔调写，不是直译。
- `sportzball_imp`（足球小鬼）在 `ZombieAlmanac` 里没有条目，它的档案只存在于数据层，不写图鉴。

## [1.2.13] - 2026-10-11

### 新增

- **国王 / 亚瑟王：出场期间不再无敌，改为「开场压血量 + 落地回满」**。
  - 引擎里国王的免打靠的是基类 `setBodyRec` 周期性把 `bodyRec` 置成空矩形
    （出场整段 `switching = true`）。挂 `Zombie.prototype.setBodyRec`，
    出场期间强制走正常路径。**只拦这一层，不写回 `switching`** ——
    否则会打断随后由 `detectKnight` 驱动的授爵流程。
  - 出场期间血量上限与当前血量一起压低：杖国王 **200** / 剑国王 **300**；
    成功落地后回满（**1000** / **1500**）。
  - 「落地」用 `switching` 转 `false` 判定 —— 国王是 `GridZombie`，出场播的是
    `playAnimation("Spawn")`、**不走 `playDirtSpawn`**，所以 `onDirtSpawned`
    永远不会触发（1.2.12 曾误挂在那里，导致标记与易伤都清不掉）。
  - 按反馈**不做易伤**：开场压血量已足够体现「出场虚弱」。

- **国王 / 亚瑟王：每给僵尸授爵一次，自扣 150 血**。
  挂在 `DarkKingZombie._give()` 上 —— 那就是授爵那趟流程。

### 移除

- **运兵艇（`sky_dropship`）的全部改动**。
  曾试图让它可打并给 4000 血，但它是 `isRealZombie = false` 的**非真实单位**：
  强行置真会让国王授爵时选中它，而它的 `addArmor` 是空实现（`return null`），
  结果「授勋后僵尸拿不到防具」。该单位牵动授爵、吞噬、磁力菇等一整串判定，
  收益不值得，整体撤销（血量回到原值 1200，不再显示额外血条）。

## [1.2.12] - 2026-10-11

### 修复

- 修复「授勋后僵尸拿不到防具」—— 由 1.2.11 引入，根因同上（运兵艇）。

## [1.2.11] - 2026-10-11

### 修复

- **国王与运兵艇的判定改走 ID**，不再依赖 `zombieCodename()`。
  真凶是 `isKingZombie` 被**重复声明**（旧版国王拦截的残留声明在后面，
  覆盖了新版本），而旧版只靠 codename 判定、拿不到就恒返回 `false`，
  导致整条逻辑一行都不执行。ID：`dark_king = 187`、`dark_king_veteran = 188`、
  `sky_dropship = 362`。

## [1.2.10] - 2026-10-11

### 修复

- 实体化改挂 `Zombie.prototype.setBodyRec`（`bodyRec` 的周期性重算入口），
  此前只改 getter，下一次重算就被覆盖。

## [1.2.7] ~ [1.2.9] - 2026-10-11

- 国王出场解除无敌帧的一系列尝试（含 `bodyRecHiddenCD`、命中框 getter 等），
  均未生效 —— 真正的入口是 `setBodyRec`，见 1.2.10 起。
- 运兵艇解除无敌 + 4000 血（已于 1.2.13 撤销）。

## [1.2.6] - 2026-10-10

### 新增

- **魔音甜菜不再被朋克僵尸踢飞**。引擎里 `EightiesPunkZombie.whenPlantDetected`
  会先检查所在行有无植物带 `CannotBePushedByFootballMech` —— 有则改为正常吃植物，
  不再推走。白萝卜（`turnip`）靠的就是这个字段。
  给 `phatbeet`（魔音甜菜）与 `phatbeet_rhythm`（音游甜菜）一并加上，纯数据补丁。

## [1.2.5] - 2026-10-10

### 修复

- **像素路障 / 像素铁桶不掉血**。ID 白名单只列了 334（本体），漏了 335（路障）
  与 336（铁桶）。现改为 `[334, 335, 336]`，三个变体一并生效。
- **音波斩补删**。舞台效果期间已有减伤 50%，再叠音波过于强势，
  现单独挂 `onSmashing` 把它整体拦掉（普通砸击走另一条路径，不受影响）。

## [1.2.4] - 2026-10-10

### 变更

- **像素僵尸改为「直接作用于本体的真实伤害」**。原先的写法（构造伤害对象并把
  `armorProtection` 置假）实测**根本不掉血**；现直接改 `health`，
  不经过任何减伤、免疫与防具判定，必定生效。护甲一并削掉，归零后调 `playDie()`。
- **重金属巨人改为舞台效果期间减伤 50%**。不再发射音波、也不再扔小鬼，
  只保留 `extraDamageScale` 返回 `0.5` 这一条。

## [1.2.3] - 2026-10-10

### 修复

- **钩子统一改挂基类**（`Zombie` / `GridZombie`）。此前挂在具体子类上，
  子类一旦定位不到就整条静默失效。
- **`zombieCodename()` 的兜底顺序修正**：原来 `engine` 检查在前，
  `activeCtx` 为空时直接返回，导致「从僵尸实例自身取 codename」的兜底永远走不到。

## [1.2.2] - 2026-10-10

### 移除

- 撤回「万圣节一系免疫电击」的改动 —— 经确认**免疫电击是游戏自带行为**，
  连原版的弗兰肯斯坦巨尸本身就免疫，不属于本模组该做的事。

## [1.2.1] - 2026-10-10

### 修复

- **音波回归**（1.2.0 引入的回归）：改挂每帧更新时把 `onSmashing` 的拦截撤掉了。
- 像素僵尸改用 ID + codename 双重判定。
- 补齐蜻蜓的换皮版本（`summer_bug` 系列萤火虫僵尸）。

## [1.2.0] - 2026-10-10

### 变更

- **冰系免疫范围修正**：移除冰鼬一系（227 / 228），
  改为雪人小鬼（229）与宝藏雪人（387）—— 即「所有类型的雪人僵尸」。

## [1.1.0] - 2026-10-10

### 新增

- **脉冲黄桃瘫痪并强制落地所有飞机**：小鬼飞机 / 单体战斗机 / 双体战斗机 /
  无人机 / 裁决者（僵王除外）。
  引擎里基类 `Zombie.empStun` 是空函数，飞行僵尸中仅无人机有覆盖 ——
  其余四类原本完全免疫，这里把五类补齐，并借 `flying = false` 触发引擎的落地回调。

### 移除

- 取消「未来三只机甲死后自爆」与「失落巨人火把碰撞焚烧」两项改动 ——
  均无法在游戏中实际生效。

## [1.0.1] - 2026-10-09

首个版本。基础调整：18 只小鬼血量 → 95、蜻蜓护甲 350 → 90、
街机召唤自扣血与禁像素铁桶、轮滑踩地刺秒杀、霹雳舞一次一只并自扣 50、
麦克甩完麦自杀、章鱼投掷自扣 150、弄臣旋转 20/秒。
