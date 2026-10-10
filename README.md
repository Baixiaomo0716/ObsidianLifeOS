# LifeOS

基于Obsidian的人生管理系统：记账专用表单和独立JSON行数据表，其余九类Markdown模板笔记。当前已完成实施契约、基础环境确认、插件工程、视图入口、模型与双源安全存储底层，九类笔记新建和原生属性编辑已接入；专用记账表单待后续开发。

## 当前开发进度

DEV-001至DEV-007及DEV-010～018工程已完成；228项自动化测试通过（生命周期与事件10、领域21、存储45、操作/完整性/回收43、索引8、搜索5、关联12、附件22、日记11、设置11、UI7、模板19、中文字段8、统一模板6）。九类MD和记账JSON安全存储、操作恢复、冲突副本和统一索引已实现。桌面基础实测通过，手机按用户要求暂缓，DEV-008其他细项和DEV-009完整同步恢复仍待验收。回看页面已接入搜索、筛选与反向关联查询。日记和待办已接入多类型关联选择器。项目附件导入命令已接入，支持多文件、独立重试和引用保护。日记日期浏览、正文预览和原生编辑已接入。下一项DEV-019日记多项关联与新建返回，需先核对专用模块依赖。

## 构建与安装

使用Node.js22或更新版本、pnpm11.25.0；本次验证Node24.19.0。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

pnpm check包含类型检查、生产构建、产物/移动依赖验证、生命周期、领域、存储和操作恢复测试。存储测试只在忽略的本地测试库写入合成记录。pnpm dev为监听模式；提交前停止监听再运行pnpm check。
产物位于dist/，开发安装只复制main.js、manifest.json、styles.css到专用测试Vault的.obsidian/plugins/life-os/。build-meta.json仅本地检查，不用于安装。启用后可通过“打开 LifeOS”命令、侧边图标或插件设置入口打开开发预览；九类模板笔记可以新建并打开原生编辑器；基础宿主加载已实测，新入口和校验侧栏待补验。
最低应用1.13.4；isDesktopOnly=false是兼容目标，API类型基线1.13.1，依据及第三方声明限制见[DEV-003](docs/tasks/DEV-003.md)。
node_modules、dist、pnpm-store和本地测试数据不提交，pnpm-lock.yaml和工程配置提交。业务属性实际使用中文，兼容旧拼音数据；技术配置、源码变量、恢复日志和第三方API保持各自协议。

## 开发效果测试库

固定使用本工程下的dev-vault作为Obsidian开发测试库，插件安装位置为dev-vault/.obsidian/plugins/life-os/。这是Obsidian笔记库，不是新的源码Git仓库；源码继续在life-os工程维护。测试库已忽略，不上传个人数据。

运行pnpm dev:vault监听源码修改，成功构建后自动复制main.js、manifest.json、styles.css到测试库；样式和manifest修改也触发构建。监听需要保持运行，关闭开发进程后需重新启动。也可运行pnpm install:vault进行一次安装。

首次在Obsidian选择“打开文件夹作为仓库”，选择dev-vault，并在设置的第三方插件中允许、启用LifeOS。按Ctrl+P执行“打开 LifeOS”。每次更新后按Ctrl+R重新加载宿主，再打开LifeOS；自动复制产物不会让已加载的插件代码自动生效。当前仅开发预览，真实设备完整验收仍归DEV-008。

## 文档索引

DEV-010已加入文件事件与双源索引。刷新后执行“LifeOS：重建索引并查看结果”，可查看有效条数及问题数。默认只读取LifeOS/正式管理根，隔离验收样本不计入，空库显示0条正常。见[DEV-010](docs/tasks/DEV-010.md)。

DEV-008正在进行：刷新插件后，在Obsidian命令面板执行“LifeOS：运行宿主验收（仅生成独立测试数据）”。报告位于LifeOS验收/<运行标识>/验收报告.md。真机步骤见[DEV-008](docs/tasks/DEV-008.md)，结果登记见[宿主验收](docs/qa/P0-host.md)。运行会创建合成数据，九类笔记新建已接入，专用记账表单待开发。

- [任务清单](开发任务清单.md)、[排期](开发计划.md)、[文件职责](开发文件清单.md)、[PRD1.8](PRD-v1.0.md)。
- [架构](docs/architecture.md)、[数据](docs/data-schema.md)、[验收](docs/test-plan.md)。
- [九类模板](templates/README.md)、[混合录入](docs/template-entry.md)、[独立账本](docs/ledger-table.md)。
- [环境矩阵](docs/device-sync-matrix.md)、[Git同步](docs/git-vault-sync.md)。
- [DEV-001](docs/tasks/DEV-001.md)、[DEV-002](docs/tasks/DEV-002.md)、[DEV-003](docs/tasks/DEV-003.md)、[DEV-004](docs/tasks/DEV-004.md)、[DEV-005](docs/tasks/DEV-005.md)、[DEV-006](docs/tasks/DEV-006.md)、[DEV-007](docs/tasks/DEV-007.md)。

历史PRD、附录、原型与docs/history仅对照，不替代当前契约。源码远程与个人Vault远程分开，本次开发不推送笔记。


用户已确认Windows桌面Obsidian1.14.4六项宿主检查通过，完全退出重开后页面与测试文件正常；手机验收目前暂缓。DEV-009已完成该合成目录的Vault外ZIP备份、空目录恢复及7文件摘要核对，完整同步/附件/独立物理备份仍待验收。

DEV-011新增完整性检查和回收列表/恢复命令；宿主隔离验收扩展为八项。刷新后可执行“检查数据完整性”与“查看回收记录”，只针对正式LifeOS/；新宿主项仍待实测。记录见docs/tasks/DEV-011.md。

DEV-012已提供LifeOS设置页：根目录、十类模块目录/开关、时区、附件上限与收支分类。保存后Ctrl+R重新加载生效；目录变更不迁移文件，分类改名或停用不改历史。记录见docs/tasks/DEV-012.md。

DEV-013已提供首页/记录/回看/设置四页框架、侧栏/窄屏底栏、卡片滚动及工作台内设置。九类记录创建由DEV-014接入，真实回看列表仍待后续模块，布局宿主补验步骤见docs/ui-spec.md。

DEV-014已接入九类模板新建、模板安装和笔记校验侧栏。刷新后打开LifeOS→记录→选择类型，创建后在原生属性编辑。详见[DEV-014](docs/tasks/DEV-014.md)。

日记按月份保存为纯日期名；待办/项目使用纯名称。三类属性简化与日期类型已接入，项目侧栏提供中文进度下拉。旧笔记可通过整理当前笔记命令转换。详见[属性调整](docs/tasks/DEV-014-properties.md)。

十类记录的实际字段和规定枚举已改为中文，模板和测试库正式记录已备份迁移。业务文件格式版本3；刷新后重新打开笔记即可查看。[中文迁移记录](docs/tasks/DEV-014-chinese-fields.md)。

当前九类模板统一使用原生tags、隐藏标识/名称/归档/取消属性，除日记外进度均为列表。所有新笔记标题去掉UUID，已有阅读/影视文件后缀已清理。176项检查通过，详见[统一模板记录](docs/tasks/DEV-014-unified-templates.md)。




