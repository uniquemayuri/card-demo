使用说明

- 直接本地测试：可以双击打开 `webapp/index.html` 在浏览器中运行（某些浏览器对本地文件有跨域限制，不推荐长期用）。
- 推荐通过内置启动脚本运行本地静态服务器：

	Windows (PowerShell):
	```powershell
	cd "c:\Users\t9413128\Saved Games\webapp"
	powershell -ExecutionPolicy Bypass -File start-server.ps1
	```

	或者使用 Python 的简单服务器：
	```powershell
	cd "c:\Users\t9413128\Saved Games\webapp"
	python -m http.server 8000
	```

	然后在浏览器打开 `http://localhost:8000`。

- 控制键（已更新）：
	- A：向左移动
	- D：向右移动
	- S：加速下落（软降）
	- R：旋转
	- Enter：硬降（立即落到底）
	- Z / X：备用旋转
	- 空格：暂停

- 快速说明（当前已实现的重要机制）：
	- 预选卡：点击开始后会先给一次从三张“编号为1”的卡牌中选择一张的机会，所选卡为被动并影响接下来的关卡。
	- 关卡目标：前十关的目标分数为原有值的两倍，用于挑战和过关判断。
	- 商店与许愿：进入商店免费（UI 中有 `商店等级`），可升级商店（消耗金币）；每次进入商店可选择一次花费 3 金币的许愿（指定卡类或编号），下一次商店与过关奖励将优先包含该许愿项。
	- 任务系统：每局开始与每关间会提供 3 个任务候选（如消除指定颜色块、清满行次数、下落指定形状次数、达到列高等），完成可获得金币奖励，某些关卡通过会使下次任务包含卡牌奖励。
	- 道具系统：实现了一组新道具（如 `iron_sword`、`iron_shield`、`gem_pendant`、`valuable_earring`、`horror_mask`、`rare_cloak`、`shop_card`、`golden_chalice`、`hope_staff`、`lucky_cat`、`hourglass`），各自有即时或被动效果（详见代码 `tetris.js` 中 `applyItem` / `generateShopItems` 实现）。
	- E 类与标记/狙击：E 类卡会影响“标记”生成，被标记的方块带有 `MARK_FLAG`，玩家可触发狙击效果选择并清除被标记区域。
	- 动画节奏：关键视觉动画统一为约 1000ms（常量 `ANIM_DURATION = 1000`），行消除时会播放动画并在动画期间阻止方块下落以保持视觉一致性。
	- 随机性控制：生成方块时包含重复抑制逻辑，避免连续多次出现相同的方块形状。
	- 本地排行榜：第 11 关的分数会存入本地存储，键名为 `tetris_lb_v1`，可以在游戏内查看排行榜。

- 主要代码文件（便于快速定位）：
	- `webapp/tetris.js`：游戏逻辑、卡牌/道具/商店/任务实现
	- `webapp/index.html`：界面和控件布局
	- `webapp/style.css`：样式与部分动画样式
	- `webapp/serve.js`、`start-server.ps1`、`clear-ports.ps1`：用于启动本地静态服务器与端口管理的脚本

如果需要，我可以把 README 中的道具与卡牌详细描述补全为表格，或直接在 `webapp/` 下添加一份更详尽的 `BALANCE.md`。现在你想让我：

- 在本地启动服务器并帮你做一轮按键交互测试？（我可以运行脚本并报告结果）
- 还是先把 README 中的道具与卡牌效果写得更详细？
