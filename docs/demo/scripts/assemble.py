import json, subprocess
FF = 'node_modules/ffmpeg-static/ffmpeg'
parts = [('part1', 470, [[402, 452]], 506.1), ('part2', 380, [[316, 362]], 411.6), ('part3', None, [], 107.6)]
def dur(f):
    out = subprocess.run([FF, '-i', f], capture_output=True, text=True).stderr
    h, m, s = out.split('Duration: ')[1].split(',')[0].split(':'); return int(h)*3600+int(m)*60+float(s)
segs, marks, offset = [], [], 0.0
for i, (name, end, extra, done) in enumerate(parts):
    d = json.load(open(f'{name}/marks.json')); D = dur(f'{name}/raw.webm'); end = end or D - 0.5
    k = (D - 2.3) / done; vt = lambda t: 2.3 + k * t  # script clock -> video clock
    d['cuts'] = [[vt(a), vt(b)] for a, b in d['cuts']]
    for m in d['marks']: m['t'] = vt(m['t'])
    cuts = sorted([c for c in d['cuts'] + extra if c[1] - c[0] > 1.5 and c[0] < end])
    merged = []
    for a, b in cuts:
        b = min(b, end)
        if merged and a <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], b)
        else: merged.append([a, b])
    keep, cur = [], 0.0
    for a, b in merged:
        if a > cur: keep.append((cur, a))
        cur = max(cur, b)
    keep.append((cur, end))
    def newt(t):
        return offset + t - sum(min(b, t) - a for a, b in merged if a < t)
    for m in d['marks']:
        if m['t'] < end: marks.append({**m, 'video_t': round(newt(m['t']), 1)})
    for a, b in keep: segs.append((i, a, b))
    offset += sum(b - a for a, b in keep)
fc, labels = [], []
for k, (i, a, b) in enumerate(segs):
    fc.append(f'[{i}:v]trim=start={a:.2f}:end={b:.2f},setpts=PTS-STARTPTS,fps=25[v{k}]'); labels.append(f'[v{k}]')
fc.append(''.join(labels) + f'concat=n={len(segs)}:v=1:a=0[out]')
cmd = [FF, '-y', '-v', 'error'] + sum([['-i', f'{p[0]}/raw.webm'] for p in parts], []) + ['-filter_complex', ';'.join(fc), '-map', '[out]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'final.mp4']
subprocess.run(cmd, check=True)
json.dump({'duration': round(offset, 1), 'marks': marks}, open('final_marks.json', 'w'), indent=1, ensure_ascii=False)
print('duration', round(offset, 1))
for m in marks: print(f"{int(m['video_t']//60)}:{m['video_t']%60:04.1f}  {m['title']}")
