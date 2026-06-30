from PIL import Image, ImageDraw
import os

SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
OUTPUT_DIR = '/workspace/icons'

os.makedirs(OUTPUT_DIR, exist_ok=True)

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 背景色
    bg_color = (10, 10, 24)
    
    # 霓虹颜色
    cyan = (34, 245, 255)
    pink = (255, 62, 165)
    purple = (194, 107, 255)
    yellow = (255, 236, 66)
    
    # 圆角矩形背景
    radius = int(size * 0.15)
    draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=bg_color)
    
    # 外发光边框（模拟霓虹效果）
    border_width = max(2, int(size * 0.015))
    for i in range(border_width):
        alpha = int(255 * (1 - i / border_width))
        draw.rounded_rectangle(
            [i, i, size - i, size - i],
            radius=radius - i,
            outline=(cyan[0], cyan[1], cyan[2], alpha),
            width=1
        )
    
    # 中心手柄图标
    cx, cy = size // 2, size // 2
    handle_width = int(size * 0.47)
    handle_height = int(size * 0.24)
    handle_radius = int(size * 0.08)
    
    # 手柄主体
    draw.rounded_rectangle(
        [cx - handle_width//2, cy - handle_height//2,
         cx + handle_width//2, cy + handle_height//2],
        radius=handle_radius,
        outline=cyan,
        width=max(2, int(size * 0.015))
    )
    
    # 左摇杆
    joystick_radius = int(size * 0.05)
    joystick_center = (cx - int(size * 0.12), cy)
    draw.ellipse(
        [joystick_center[0] - joystick_radius, joystick_center[1] - joystick_radius,
         joystick_center[0] + joystick_radius, joystick_center[1] + joystick_radius],
        fill=cyan
    )
    inner_radius = int(joystick_radius * 0.5)
    draw.ellipse(
        [joystick_center[0] - inner_radius, joystick_center[1] - inner_radius,
         joystick_center[0] + inner_radius, joystick_center[1] + inner_radius],
        fill=bg_color
    )
    
    # AB按钮
    btn_radius = int(size * 0.035)
    a_center = (cx + int(size * 0.08), cy - int(size * 0.03))
    b_center = (cx + int(size * 0.14), cy + int(size * 0.03))
    
    draw.ellipse(
        [a_center[0] - btn_radius, a_center[1] - btn_radius,
         a_center[0] + btn_radius, a_center[1] + btn_radius],
        fill=pink
    )
    draw.ellipse(
        [b_center[0] - btn_radius, b_center[1] - btn_radius,
         b_center[0] + btn_radius, b_center[1] + btn_radius],
        fill=yellow
    )
    
    # 顶部按键
    top_key_width = int(size * 0.04)
    top_key_height = int(size * 0.025)
    top_key_radius = int(top_key_height * 0.5)
    
    l_center = (cx - int(size * 0.06), cy - handle_height//2 - int(size * 0.03))
    r_center = (cx + int(size * 0.02), cy - handle_height//2 - int(size * 0.03))
    
    draw.rounded_rectangle(
        [l_center[0] - top_key_width//2, l_center[1] - top_key_height//2,
         l_center[0] + top_key_width//2, l_center[1] + top_key_height//2],
        radius=top_key_radius,
        fill=purple
    )
    draw.rounded_rectangle(
        [r_center[0] - top_key_width//2, r_center[1] - top_key_height//2,
         r_center[0] + top_key_width//2, r_center[1] + top_key_height//2],
        radius=top_key_radius,
        fill=(34, 255, 143)  # 绿色
    )
    
    # 角落装饰
    corner_radius = int(size * 0.016)
    corners = [(int(size * 0.12), int(size * 0.12)),
               (int(size * 0.88), int(size * 0.12)),
               (int(size * 0.12), int(size * 0.88)),
               (int(size * 0.88), int(size * 0.88))]
    corner_colors = [cyan, pink, purple, yellow]
    
    for (x, y), color in zip(corners, corner_colors):
        draw.ellipse(
            [x - corner_radius, y - corner_radius,
             x + corner_radius, y + corner_radius],
            fill=(color[0], color[1], color[2], 150)
        )
    
    return img

for size in SIZES:
    icon = draw_icon(size)
    path = os.path.join(OUTPUT_DIR, f'icon-{size}.png')
    icon.save(path)
    print(f'Created: {path}')

print('\nAll icons generated successfully!')
