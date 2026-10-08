# LifeOS 数据契约

契约版本：1.0；冻结日期：2026-10-08；新建数据 schema_version：1。
依据：[当前 PRD](../PRD-v1.0.md)、[架构契约](architecture.md)。下列必填指保存到文件时必须存在；表单可按默认值补齐。无迁移授权不改写旧笔记。

## 1. 编码和公共字段

每个实体一个 UTF-8 Markdown 文件，开头简单 YAML，正文自由 Markdown。禁止嵌套业务对象，列表仅使用标量。可选值未知时省略，不用空字符串、null 或 0 代替未知。日期和时间用带引号字符串；解析器不得悄悄转为 Date 对象。

| 字段 | 类型 | 约束 |
|---|---|---|
| id | UUID v4 字符串，必填 | 创建前生成，全库唯一，永不因标题/路径修改；复制为新实体须新 ID |
| type | 枚举字符串，必填 | journal/transaction/work/experience/performance/trip/place/knowledge/task/project |
| title | 非空字符串，必填 | 去除首尾空白，文件名与标题独立；标题变更不自动重命名文件 |
| schema_version | 整数，必填 | 新数据为 1；文档版本与数据版本分开；未知版本只读 |
| created_at | 带偏移 ISO 8601 时间，必填 | 如 2026-10-08T14:00:00+08:00；创建后不改 |
| updated_at | 带偏移 ISO 8601 时间，必填 | 成功实际修改才更新，重复成功重试不刷新；不用它作唯一并发令牌 |
| tags | 字符串列表 | 默认 []，去空去重；未知标签不自动删除 |
| related_ids | UUID 字符串列表 | 默认 []，跨所有十类，去重，禁止自身；缺失目标保留并报告 |

所有 *_id 和 *_ids 指稳定实体 ID，*_paths 是 Vault 相对文件路径。正文双链可供阅读，但不会取代 ID 关系。未知键及其值类型保留，正文未明确编辑时原样保留；不承诺 YAML 排版字节不变。非法 YAML 不保存，重复 ID 不参与统计，缺失关系不删除源内容。

业务日期为合法日历日 YYYY-MM-DD，不包含时间。默认业务时区 Asia/Shanghai；今日、跨月等按设置时区计算。时间先按瞬时比较再按业务时区分组；手填历史业务日期保持不变。改变时区只影响“今天”及时间分组，不自动重写历史 date。起止时间/日期均允许相等；缺一端不推算另一端。

## 2. 统一进度和管理字段

| 字段 | 类型 | 适用及规则 |
|---|---|---|
| status | not_started/in_progress/completed，必填 | task/project/work/performance/trip、performance 类型 experience；新建默认 not_started |
| completed_at | 偏移时间，可选 | status=completed 时必填；首次完成生成，重复完成保留；离开 completed 清除 |
| is_cancelled | 布尔 | 上述有状态实体默认 false；取消不等于 completed |
| cancelled_at | 偏移时间，可选 | is_cancelled=true 时必填，恢复取消清除 |
| archived | 布尔 | 上述有状态实体默认 false；独立于进度，归档不生成经历 |

日记、交易、地点、知识与其他消费经历不强制进度字段。取消保留原进度便于理解历史，但完成统计排除取消。任务撤销完成默认 not_started；项目“重新打开”固定 in_progress，同时清除 completed_at、取消及归档标记。普通状态编辑不隐式解除取消/归档。

历史迁移仅预览、备份后执行：todo/planned→not_started；active/ongoing→in_progress；done/attended→completed（无原完成时间要求用户补充，不造时间）；paused→not_started 并保留说明；dropped/cancelled→not_started+is_cancelled（取消时间缺失亦需补充）。保留原字段于迁移报告，不把猜测值写成真实事件。

## 3. 十类实体字段

以下字段叠加公共字段及适用管理字段。各表未列字段不得由当前表单删除。

### 3.1 journal（日记）

| 字段 | 类型/要求 | 规则 |
|---|---|---|
| date | 日期，必填 | 一业务日默认一篇；再次创建打开已有；存在多篇报告、不自动合并 |
| mood | 字符串，可选 | 自由心情，不强制评分枚举 |
| trip_id | UUID，可选 | 指向 trip，用于旅行归属 |

正文保存日记。显式 related_ids 与按日期查询的当天交易/完成待办/经历分区展示；自动汇总不写进关系列表，不复制交易金额。跨类型切换保留待选择集合；新建目标失败不丢原选择。

### 3.2 transaction（交易）

| 字段 | 类型/要求 | 规则 |
|---|---|---|
| date | 日期，必填 | 实际记账业务日期 |
| kind | expense/income/transfer/refund，必填 | 条件字段如下 |
| amount_minor | 安全整数，必填 | >0，以 currency 定义的最小单位存储 |
| currency | 大写货币代码，必填 | 必须来自已配置货币字典 |
| account_id | UUID，条件必填 | expense/income/refund 的收付账户 |
| category_id | UUID，条件必填 | expense/income 的分类；替代 PRD 早期文字中的 category |
| source_account_id | UUID，条件必填 | transfer 转出账户 |
| target_account_id | UUID，条件必填 | transfer 转入账户，不能等于转出 |
| original_transaction_id | UUID，条件必填 | refund 对应一笔 expense |
| project_id / trip_id | UUID，各可选 | 各自单一归属；用于费用查询，不反向复制金额 |

expense/income 禁止 transfer/refund 专属字段；transfer 禁止 account_id/category_id/original_transaction_id；refund 禁止 transfer 专属字段，category_id 不存，显示和分类汇总继承原支出分类。退款默认并限定回到原支出账户和币种（P1）；其他账户退款另立后续需求。原账户停用仍可退款，不能新建普通收支。被引用原支出禁止删除、改变金额/币种/账户/分类，需先处理退款；标题和说明可安全修改。

金额输入以十进制字符串解析，禁止二进制浮点乘法取整。小数位不得超过货币 exponent，超出明确报错；检查整数和求和均不超过 Number.MAX_SAFE_INTEGER。P1 默认 CNY exponent=2；其他币种必须显式配置 exponent（0–3）且分组展示，无汇率合计。12.50 CNY→1250，12.501 CNY 拒绝。

转账仅同币种不同账户；不计收入、支出。退款同币种且有效退款累计不超过原支出；按退款 date 抵减当期净支出。收入=income；净支出=expense−refund，可为负。同步后发现并发超额退款，标记关联交易组统计不确定并列出明细，不能静默裁掉一笔或声称分布式锁避免了问题。

账户余额=明确期初余额+收入−支出+退款+转入−转出，仅计算期初日及以后的交易；是记录推算值。新交易早于账户期初日禁止，旧数据例外报告待核对，不伪造余额。有关联退款的统计需原支出可读取，否则保留文件并提示统计不完整。

### 3.3 work（作品）

| 字段 | 类型/要求 | 规则 |
|---|---|---|
| work_type | book/movie/series/game，必填 | 决定界面模块 |
| author | 字符串，可选 | book 作者 |
| isbn | 字符串，可选 | 保留前导零，不用数值 |
| creators | 字符串列表，可选 | movie/series 创作者 |
| release_year | 整数，可选 | 1–9999 |
| platforms | 字符串列表，可选 | game 平台 |
| cover_path | 相对路径，可选 | 本地封面；外部导入另行评估 |
| rating | 有限数值，可选 | 0–10，允许小数，缺失不默认 0 |
| total_pages / total_episodes | 正整数，可选 | 对应 book / series，用于进度校验 |

共用三状态。状态表示当前档案进度，不能凭状态生成阅读、观看、游玩时长或次数；统计来自 experience。非法不适用字段提示但不破坏手工未知属性。

### 3.4 experience（经历）

| 字段 | 类型/要求 | 规则 |
|---|---|---|
| experience_type | reading/viewing/gaming/performance，必填 | 区分消费/参与 |
| date | 日期，必填 | 经历发生日 |
| work_id | UUID，条件必填 | reading→book；viewing→movie/series；gaming→game |
| performance_id | UUID，条件必填 | performance；与 work_id 互斥 |
| action | 枚举，消费必填 | reading:start/progress/complete/reread_complete；viewing:progress/complete/rewatch_complete；gaming:play/complete |
| duration_minutes | 非负安全整数，可选 | 缺失是未知，不等于 0；不由档案状态自动产生 |
| page_from / page_to | 非负整数，可选 | reading；成对且 from≤to，不超过已知总页数 |
| episode_numbers | 正整数列表，可选 | viewing/series，去重，不超过已知总集数 |
| seat | 字符串，可选 | performance 座位 |
| trip_id | UUID，可选 | 指向 trip |
| attachment_paths | 相对路径列表，可选 | 票根等，本地附件引用 |

performance 经历使用三状态且不存消费 action；只有非取消 completed 参与计参加次数。场次 completed 不等于参加经历 completed。

阅读已读数=期间 complete/reread_complete 的不同 work_id 数，重读次数=reread_complete 数。影视作品数按完整 complete/rewatch_complete 的 work_id 去重，观看次数按经历计；series 的 progress+episode_numbers 不算整部完成，完整完成必须显式确认整部。游戏分钟仅求已填值，另展示缺时长条数；通关次数来自 complete。合法独立经历按 ID 去重，不能按标题去重。

### 3.5 performance（演出场次）

| 字段 | 类型/要求 | 规则 |
|---|---|---|
| category | 字符串，可选 | 演出类型标签，不是记账 category_id |
| performers | 字符串列表，可选 | 艺人/团体 |
| starts_at / ends_at | 偏移时间，可选 | 两者均存在时 end≥start |
| venue | 字符串，可选 | 场馆名称 |
| place_id | UUID，可选 | 可复用地点 |
| attachment_paths | 相对路径列表，可选 | 海报、票据 |

使用三状态，实际参与由 experience 记录。票款仅 transaction 计算；任何场次/经历中不得存可计入收支的重复票款。

### 3.6 trip（旅行）

| 字段 | 类型/要求 | 规则 |
|---|---|---|
| start_date / end_date | 日期，可选 | 两者均有时 end≥start |
| place_ids | UUID 列表 | 默认 []，指向 place，去重 |
| budget_minor | 非负安全整数，可选 | 必须与 budget_currency 成对 |
| budget_currency | 货币代码，可选 | 从货币字典取值 |
| attachment_paths | 相对路径列表，可选 | 行程文档 |

使用三状态。实际净费用按 transaction.trip_id 反查并分币种算支出−退款；预算独立，不写实际总额缓存为权威。日记、经历与其他记录可通过 trip_id 或显式关联导航，两种关系不重复计费。

### 3.7 place（地点）

| 字段 | 类型/要求 | 规则 |
|---|---|---|
| place_type | 字符串，可选 | 城市/场馆/景点等自由分类 |
| country / region / city / address | 字符串，各可选 | 不依赖地图服务 |
| latitude / longitude | 有限数值，各可选 | 成对，纬度[-90,90]、经度[-180,180] |

可复用档案，不因一次旅行结束改为 completed。

### 3.8 knowledge（知识）

| 字段 | 类型/要求 | 规则 |
|---|---|---|
| knowledge_type | concept/method/excerpt/synthesis，必填 | 新建默认 concept |
| source_ids | UUID 列表 | 默认 []，十类来源，去重且禁止自身 |
| source_url | 字符串，可选 | 合法 http/https URL |

正文存摘录和个人理解。从经历新建带入该经历 source_ids，不生成虚构理解；缺失来源提示并保留。无强制进度状态。

### 3.9 task（待办）

| 字段 | 类型/要求 | 规则 |
|---|---|---|
| priority | low/medium/high，必填 | 默认 medium |
| scheduled_date / due_date | 日期，各可选 | 均有时 scheduled≤due |
| project_id | UUID，可选 | 一个项目，task 是归属唯一权威 |
| source_ids | UUID 列表 | 默认 []，源笔记，去重禁止自身 |

只填 title 即可创建。收集箱=没有计划日、截止日和项目的未完成非取消任务；今天=scheduled 或 due 等于今日的未完成非取消任务；逾期=due<今日的未完成非取消任务且优先归逾期，避免今天重复。跨天不复制、不改原日期。归档项默认不进入行动列表，可在全部中查看。完成统计=status=completed、非取消且 completed_at 在期内；非历史事件审计。自由正文 checkbox 不解析为系统待办。

### 3.10 project（项目）

| 字段 | 类型/要求 | 规则 |
|---|---|---|
| goal | 非空字符串，必填 | 项目目标，长说明放正文 |
| completion_criteria | 非空字符串，必填 | 用户确认完成的标准 |
| start_date / target_date | 日期，各可选 | 均有时 target≥start |
| output_ids | UUID 列表 | 默认 []，产出引用；去重禁止自身 |
| attachment_paths | 相对路径列表 | 默认 []，项目文档，不存设备绝对路径 |

不存 task_ids 和权威 progress。有效任务=所有 project_id 指向本项目、未取消且有效的 task；归档任务仍属项目工作量。进度=其中 completed/有效任务数；无任务为未知（null 展示“暂无任务”）。2完成+1未完成+1取消→2/3，不能先四舍五入再计算。

项目完成需显式确认；有未完成任务时选择保留/取消/移出并按架构恢复规则执行。completed/取消/归档项目禁止新增任务归属，已有任务仍可操作。被引用项目不能直接删除；移除引用后可回收。重新打开规则见第2节。

## 4. 系统业务配置

系统配置不计入十类笔记实体：

- `00_系统/settings.json`：schema_version=1、timezone、管理根目录/模块映射、currency_exponents、attachment_max_bytes（默认20971520）。配置变化须校验，不能让旧币种指数变化而静默重新解释旧金额；有交易的币种指数禁止直接改。
- `00_系统/accounts/<id>.json`：schema_version、id、name、currency、opening_balance_minor（可负安全整数）、opening_date、active（默认true）。已有交易时币种/期初变更须明确重算预览；引用账户不物理删除。
- `00_系统/categories/<id>.json`：schema_version、id、name、kind（expense/income）、active。停用保留历史，分类类型有引用不可改。
- 附件元信息、操作日志字段见架构第4、5节。JSON 保存同样有版本检查，不能用缓存覆盖系统配置。

## 5. 样例（新建数据）

```yaml
---
id: "7184687e-9017-4db3-bc55-a0749d441ef2"
type: task
title: "整理旅行资料"
schema_version: 1
created_at: "2026-10-08T14:00:00+08:00"
updated_at: "2026-10-08T14:00:00+08:00"
tags: []
related_ids: []
status: not_started
is_cancelled: false
archived: false
priority: medium
scheduled_date: "2026-10-09"
due_date: "2026-10-10"
source_ids: []
---
这里是正文，手写的 - [ ] 不会自动改变 status。
```

其他最小新建字段：journal 增加 date；transaction 增加 date/kind/amount_minor/currency 及条件账户分类；work 增加 work_type 和管理字段；experience 增加类型/date/目标与适用 action 或管理字段；performance 增加管理字段；trip 增加管理字段；place 仅公共字段；knowledge 增加 knowledge_type/source_ids；project 增加 goal/completion_criteria/管理字段/output_ids/attachment_paths。所有引用必须指向已保存的合适类型；编辑旧文件出现缺失引用时保留并报告，不能迫使用户删掉引用才能保存无关标题变更。
