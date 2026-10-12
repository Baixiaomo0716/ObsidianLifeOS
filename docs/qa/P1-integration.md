# P1 公共流程自动化追踪

2026-10-12，DEV-029；契约1.5。324项自动化检查通过，写入均为内存合成数据，未修改真实笔记或账本。类型检查、生产构建及产物检查通过。服务重建、假宿主和组件调用不能代替实际进程重启、真机与Git同步验收。

| 规则 / 失败场景 | 可复核自动化证据 | 结果 / 实际宿主边界 |
|---|---|---|
| 原生正文、未知属性及中文字段无损；旧源版本禁止覆盖 | storage-roundtrip、chinese-fields、unified-templates、workflows测试 | 通过；原生编辑兼容仍需桌面体验 |
| 九类MD新建返回保留多选；记账专用JSON表单返回并附加引用 | journal-relations、relation-picker、workflows测试 | 通过；十类新建返回工程闭环，真实窗口交互待验收 |
| 记账保存后关联失败，不删除账本、不覆盖并发日记编辑 | workflows：日记并发修改、新账本保留、重新选择已有账本 | 通过；错误提示包含记录标识，便于核对 |
| 创建、关联回执未确认；同请求重试不重复写入 | operations、ledger-service、journal-relations、workflows测试 | 通过；请求跨进程丢失时先核对已保存记录，不能盲目重新提交 |
| 已完成关联回执重试后，目标缺失或正文后续修改 | workflows：丢失关联回执、账本删除、日记后续修改 | 通过；不恢复目标、不改写后续正文，保留已有引用供核对 |
| 版本冲突暂停；独立副本重复提交与源文件保护 | operations、workflows：待办旧版本及冲突副本 | 通过；Git实际双方冲突归DEV-031 |
| 元转分、累计金额溢出、筛选统计与原JSON导出 | domain、ledger-rules、ledger-table、summary、workflows测试 | 通过；桌面下载行为待验收 |
| 开始/截止日期、跨日、逾期优先；首页与工作台计数一致 | task-list、task-service、summary测试 | 通过；真实跨日/宿主暂停恢复待验收 |
| 项目反查待办、完成比例、取消排除、不双写项目待办 | project-service、project-lifecycle、workflows测试 | 通过；无有效待办比例未知，不自动完成项目 |
| 项目逐项关闭、部分失败与持久计划重建恢复 | project-lifecycle、project-flow-modal测试 | 通过；真实宿主完全退出再启动后的流程恢复待验收 |
| 附件真实复制后才引用；缺失/摘要不一致/共享/移出及重试 | attachments、binary-file-system、attachment-import-modal、project-files、workflows测试 | 通过；真实文件选择、格式预览和多端附件同步待验收 |
| 关闭窗口、卸载、迟到回执、无效/回收/争议记录 | lifecycle、relation-picker、project-files、entity-index、workflows测试 | 通过；完成操作可通知，不重新打开已关闭窗口 |

新增7项workflows检查连续调用实际存储、操作日志、索引及业务服务；新增2项关联选择器检查验证专用记账表单返回和取消。既有全部检查纳入同一check入口，新增test:workflows可单独复核。未发现需要阻止当前工程交付的自动化失败，不代表全部产品验收或发布条件已满足。

后续门槛：DEV-030真实布局/移动端验收（用户已暂缓手机）、DEV-031真实同步/独立恢复/性能、DEV-032安装与升级发布说明。P0及P1真实验收仍保留，不将未执行项标记通过。
