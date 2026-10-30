# 越前龙马头身比例修订

2026-10-30，按用户“脑袋有点大”的要求，使用**内置 imagegen**逐张编辑三种姿态。目标为头、帽子、头发和脸相对原身体整体缩小约四分之一，采用更自然的少年头身比例。保留白帽 R 标记、青学蓝白红球服、左手持拍和原有待机/击球/庆祝动作。

## 当前应用素材

| 姿态 | 项目资源                                    | 生成源文件                                      |
| ---- | ------------------------------------------- | ----------------------------------------------- |
| 待机 | `apps/desktop/resources/pet/ryoma-idle.png` | `exec-6fae7129-ce34-4010-9929-00ef474330eb.png` |
| 击球 | `apps/desktop/resources/pet/ryoma-hit.png`  | `exec-fd6e0ccc-cb16-4f55-a1fa-92ce1a4baf5b.png` |
| 庆祝 | `apps/desktop/resources/pet/ryoma-ace.png`  | `exec-1aec1087-3b86-4301-8d43-af32acbe5a34.png` |

原始编辑目标为本仓库上一版本的同名 PNG。待机修订图作为击球和庆祝的比例参考；生成原图保留于生成工具本机输出目录，应用只使用仓库内的上述 PNG。最终文件通过系统 sips 规范化为 512×512 RGBA，保留生成的透明 alpha；没有用其他工具重新绘制或拼接人物。初版来源和提示词见 [RYOMA-ASSETS.md](RYOMA-ASSETS.md)。

## 提示词

### 待机

Use case: identity-preserve. Edit target: image 1, the current transparent Ryoma Echizen desktop-pet IDLE sprite. Change ONLY his head-to-body proportions: reduce the ENTIRE head, including cap, hair and face, by about 25% in both width and height relative to his existing body. The result should read as a slim stylized young teenage anime tennis player around FOUR heads tall, with the head+cap about 25% of total standing height, rather than a big-headed baby chibi. Keep his youthful Ryoma identity, sharp amber/olive eyes, green-black hair, cool expression, white cap with readable red/navy R emblem, Seigaku blue-white-red uniform, left-hand racket (VIEWER'S RIGHT), ball in right hand (VIEWER'S LEFT), exact standing pose, body/arms/legs/racket/shoes sizes and locations, line style and cel shading. Naturally reconnect the smaller head to the neck. Do not mirror, change his outfit, mature his face, enlarge the hat again, or shrink the whole body. Keep the full cap, racket, hands and both shoes in frame on the same square composition with clear transparent padding. True transparent alpha background, no floor, ground shadow, scenery, added text, border or watermark.

### 击球（图 1 为原击球图，图 2 为修订待机图）

Use case: identity-preserve. Input image 1 is the EDIT TARGET pose. Input image 2 is the approved NEW SMALLER-HEAD proportion and identity reference for the same Ryoma Echizen. Change only the target's head-to-body proportions to match image 2: scale the entire head INCLUDING the cap, hair and face down by about 25% relative to the original target body. Aim for a slim stylized young teenage anime character around four-heads-tall proportions, head+cap around 25% of standing height, with the same smaller face and cap scale as image 2. Keep youthful Ryoma's dark green-black hair, sharp amber/olive eyes, cool face, readable red/navy R on the white cap, exact blue-white-red Seigaku outfit, existing arms, legs, racket, shoes, clean dark outlines and cel shading. Reconnect the neck naturally. Do not mirror, enlarge the hat, age up the character, change clothing, or shrink the whole sprite. Keep the entire cap, both shoes, all limbs and racket inside a square composition with transparent safety margins. Actual transparent alpha background; no floor, ground shadow, scenery, captions, frame or watermark. Preserve the HIT / left-handed forehand pose from image 1 exactly: racket in HIS LEFT HAND on the VIEWER'S RIGHT, one yellow ball beside the racket, empty right arm extending toward VIEWER'S LEFT, dynamic bent legs. Do not replace the pose with image 2's idle stance.

### 庆祝（图 1 为原庆祝图，图 2 为修订待机图）

Use case: identity-preserve. Input image 1 is the EDIT TARGET pose. Input image 2 is the approved NEW SMALLER-HEAD proportion and identity reference for the same Ryoma Echizen. Change only the target's head-to-body proportions to match image 2: scale the entire head INCLUDING the cap, hair and face down by about 25% relative to the original target body. Aim for a slim stylized young teenage anime character around four-heads-tall proportions, head+cap around 25% of standing height, with the same smaller face and cap scale as image 2. Keep youthful Ryoma's dark green-black hair, sharp amber/olive eyes, cool face, readable red/navy R on the white cap, exact blue-white-red Seigaku outfit, existing arms, legs, racket, shoes, clean dark outlines and cel shading. Reconnect the neck naturally. Do not mirror, enlarge the hat, age up the character, change clothing, or shrink the whole sprite. Keep the entire cap, both shoes, all limbs and racket inside a square composition with transparent safety margins. Actual transparent alpha background; no floor, ground shadow, scenery, captions, frame or watermark. Preserve the ACE celebration pose from image 1 exactly: HIS RIGHT fist raised on VIEWER'S LEFT, racket held in HIS LEFT hand on VIEWER'S RIGHT, one knee lifted, cool small smile. Do not replace the pose with image 2's idle stance.

## 验证

三张均为 512×512 RGBA，存在完全透明和不透明像素，小于 500KB。视觉检查保留完整帽子、人物与球拍，击球/庆祝仍为左手持拍。渲染窗口、点击与拖动范围、动作时序和消息规则不作修改。

最终文件大小为 idle 176398、hit 175601、ace 154283 字节。`pet-assets` 4 项及 `pet-ui` 11 项既有测试全部通过，desktop 构建与 `git diff --check` 通过；本轮只替换图片及说明，没有扩大到数据库/服务端测试。

隔离浏览器按相同的 196×196px 绘图区域显示三态新旧资源，确认全部透明 PNG 正常加载且比例更自然。此对比不代替原生交互验收。完成后重启开发应用以重新加载新版素材。

已确认开发应用重启成功：解析服务、渲染服务与 Electron 主进程均已启动，应用保持运行，临时对比预览已关闭。

[同显示尺寸的三态比例对比](../../../../docs/images/pet-proportions/comparison.jpg)
