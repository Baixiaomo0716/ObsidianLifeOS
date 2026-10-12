# DEV-009 同步与恢复记录

2026-10-09；状态：进行中。手机按用户要求暂缓，本轮只完成桌面合成数据在Vault外备份、空目录恢复及文件摘要验证。未连接或推送个人Gitee笔记仓库，未声明跨设备同步通过。

## 桌面文件恢复证据

执行时间2026-10-09T06:40:44.3536058Z。来源为dev-vault/LifeOS验收/4d8e1441-edfd-479d-ae9c-43774f65908b，仅包含用户已运行的合成检查数据。

- 备份：tests/local-backups/DEV-009-cf3b0cf0-9dd0-411a-bb87-c156521dda5f/yan-shou.zip。
- 恢复：tests/local-vault/DEV-009-restore-cf3b0cf0-9dd0-411a-bb87-c156521dda5f/4d8e1441-edfd-479d-ae9c-43774f65908b/。
- 清单：备份目录yan-shou.json，含相对路径、字节数与SHA-256，目录均已被源码Git忽略。
- 7份文件：报告1、操作日志3、记账JSON1、知识MD1、冲突MD1。恢复文件数量及全部摘要与源一致；备份过程中源摘要再次核对一致。源数据未删除或覆盖。

这是从ZIP恢复真实文件的证据，不是完整Vault、附件、关联、重建统计或宿主恢复验收。样本没有附件和跨实体引用，因此这些项未执行。本地备份虽在Vault外，仍在同磁盘，不代表异地或异盘备份。

## 待验收

| 项目 | 当前结果 |
|---|---|
| 恢复后用Obsidian读取样本 | 待执行 |
| 实际Git双端离线新增、同文件冲突 | 手机暂缓，未执行 |
| 附件同步与独立恢复 | 未执行 |
| 关系与索引重建统计 | 相关能力尚未实现 |
| 独立物理存储备份 | 目标尚未配置 |

后续按[Git方案](../git-vault-sync.md)逐项记录；用户暂缓手机不等于同步或移动支持通过。

## 2026-10-12 DEV-031桌面补证

合成真实文件恢复通过：源tests/local-vault/DEV-031-source-ROxAXx，库外快照tests/local-backups/DEV-031-lmef38（snapshot-manifest.json），空目录恢复tests/local-vault/DEV-031-restored-lpRkzJ。十类记录、附件和日志14个文件摘要一致；10条有效记录、0项问题，支出1250分，引用/项目比例/正文/附件及已完成回执不重放已核对，源未改。原报告tests/local-vault/DEV-031-restore-latest.json；重跑会更新该指针，各次独立目录保留。

本地Git试验通过：tests/local-vault/DEV-031-git-zvB8VY/report.json，Git2.55.0.windows.5；两个独立工作区离线新增2笔账本合并后12条有效、3750分，附件摘要一致。同文件冲突双方提交保留，未解决文件退出正常索引，业务有效11条且金额不变。合成冲突工作区未自动解决。此为本地bare远端，未访问Gitee，未包含手机或外部同步App。

此前“关系与索引重建统计尚未实现”已由此合成检查补齐；真实Obsidian恢复重读、Git远程/手机、异盘备份仍未执行。性能存在未达标项，见docs/performance.md。P0/P1不标记全阶段验收通过。