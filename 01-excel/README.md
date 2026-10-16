# Excel 订单合并与销售报表

适合展示：把同格式的多份订单表整理成可核对的销售报告。
工具为 Node.js 脚本，依赖 `@oai/artifact-tool`；本机使用 Codex 自带版本。

## 运行

在 `portfolio` 目录执行（输出文件必须不存在）：

```sh
node 01-excel/report.mjs 01-excel/input outputs/my-run/report.xlsx
node 01-excel/test.mjs
```

示例输入已保存在 `input/batch-1.xlsx` 和 `input/batch-2.xlsx`。
`--demo` 只用于重新生成示例输入，会覆盖这两个演示文件，请不要把真实数据放在这两个路径。
默认报告在 `outputs/demo/sales-report.xlsx`；脚本不会覆盖已有报告。

## 输入约定

- 输入为文件夹第一层的 `.xlsx` 文件，所有工作表都读取，忽略 Excel 临时锁文件。
- A1:G1 必须依次为 `order_id,date,channel,product,quantity,unit_price,status`。
- 一行代表一张订单；只支持单商品订单，不能用该逻辑直接处理多行同订单的商品明细。
- ID 为文本；日期为 `YYYY-MM-DD` 文本；quantity 为 1–100000 的整数；unit_price 为非负、最多两位小数且不超过 1000000 的金额。
- status 仅允许 `paid`、`cancelled`。只把 paid 计入销售额。
- 输入不允许公式；含公式会停止处理，要求先粘贴为值。额外列不参与汇总，请先确认前七列足够表达数据。
- 小批量内存处理，上限 10000 条；空文件夹、错误表头、全无有效订单都会报错。

## 清洗与输出

去掉首尾空格；完全一致的重复订单保留第一条；相同 ID 内容冲突时，冲突订单全部不计入销售额。
无效、取消、重复与冲突记录进入 Exceptions，含文件名、工作表、行号、原因及原始值。
原文件不修改。输出路径不能与输入相同，且必须以 `.xlsx` 结尾。

- Summary：输入/有效/排除数量、销售总额、渠道汇总。
- Orders：可筛选订单表，每行销售额为数量乘单价公式。
- Exceptions：排除记录和原因。
- 同名 `.json`：供网页使用的静态数据快照；修改工作簿不会自动更新网页，需重跑导出与网页构建。

渲染截图输出在 `screenshots/excel-*.png`，供作品展示；截图只展示部分明细，工作簿包含全部记录。
统计范围和清洗规则固定在本示例脚本中。换成真实业务前需确认退款、税费、币种、订单颗粒度。

![销售汇总](../screenshots/excel-summary.png)
