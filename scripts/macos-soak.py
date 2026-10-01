#!/usr/bin/env python3
"""本地采样指定进程及可归属的子进程；不读取窗口内容或鼠标轨迹。"""
import argparse
import datetime
import json
import platform
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pid', type=int, required=True)
parser.add_argument('--hours', type=float, default=2)
parser.add_argument('--interval', type=float, default=60)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--follow-restarts', action='store_true', help='限定在采样窗口内等待同一应用重启，记录会话断点')
parser.add_argument('--executable', type=Path, help='跟随重启时必须指定可执行文件绝对路径')
args = parser.parse_args()
if args.pid <= 0 or args.hours <= 0 or args.interval <= 0:
    parser.error('pid、hours、interval 必须为正数')
if args.follow_restarts and not args.executable:
    parser.error('跟随重启必须指定 executable，避免采集其他进程')
args.output.parent.mkdir(parents=True, exist_ok=True)
started = time.monotonic()
last_wall = time.time()
samples_summary = []
completion = 'stopped'
identity = str(args.executable.resolve()) if args.executable else None
restart_count = 0
missing_count = 0
with args.output.open('x', encoding='utf-8') as log:
    def write(value):
        log.write(json.dumps(value, ensure_ascii=False) + '\n')
        log.flush()
    write({'type': 'environment', 'system': platform.platform(), 'pid': args.pid,
           'requested_hours': args.hours, 'interval_seconds': args.interval,
           'scope': '主进程及 ppid 可归属子进程；独立 WebKit/GPU 进程未计入',
           'power': '未测；CPU 占用不能作为功耗数值', 'follow_restarts': args.follow_restarts})
    while True:
        now = time.time()
        result = subprocess.run(['ps', '-axo', 'pid=,ppid=,rss=,pcpu=,comm='],
                                capture_output=True, text=True, check=True)
        rows = {}
        for line in result.stdout.splitlines():
            fields = line.split(None, 4)
            if len(fields) != 5:
                continue
            pid, parent, rss, cpu, name = fields
            rows[int(pid)] = {'pid': int(pid), 'parent': int(parent),
                              'rss_kib': int(rss), 'cpu_percent': float(cpu), 'name': name}
        if args.pid not in rows or (identity is not None and rows[args.pid]['name'] != identity):
            if not args.follow_restarts:
                write({'type': 'stopped', 'reason': '目标进程退出或 PID 被复用', 'elapsed_seconds': time.monotonic() - started})
                break
            matches = [pid for pid, row in rows.items() if row['name'] == identity]
            if len(matches) == 1:
                previous = args.pid
                args.pid = matches[0]
                restart_count += 1
                write({'type': 'restarted', 'previous_pid': previous, 'pid': args.pid,
                       'elapsed_seconds': time.monotonic() - started})
            else:
                missing_count += 1
                write({'type': 'not_running', 'time': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                       'elapsed_seconds': time.monotonic() - started, 'matching_processes': len(matches)})
                last_wall = now
                if time.monotonic() - started >= args.hours * 3600:
                    completion = 'complete'
                    write({'type': 'complete', 'elapsed_seconds': time.monotonic() - started})
                    break
                time.sleep(min(args.interval, max(0.01, args.hours * 3600 - (time.monotonic() - started))))
                continue
        if identity is None:
            identity = rows[args.pid]['name']
        elif rows[args.pid]['name'] != identity:
            write({'type': 'stopped', 'reason': '目标 PID 已被其他进程复用'})
            break
        selected = {args.pid}
        while True:
            children = {pid for pid, row in rows.items() if row['parent'] in selected}
            if children <= selected:
                break
            selected |= children
        samples = [rows[pid] for pid in sorted(selected)]
        sample = {'type': 'sample', 'time': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'elapsed_seconds': round(time.monotonic() - started, 2),
               'wall_gap_seconds': round(now - last_wall, 2),
               'rss_kib': sum(row['rss_kib'] for row in samples),
               'cpu_percent': sum(row['cpu_percent'] for row in samples), 'processes': samples}
        write(sample)
        samples_summary.append(sample)
        last_wall = now
        if time.monotonic() - started >= args.hours * 3600:
            completion = 'complete'
            write({'type': 'complete', 'elapsed_seconds': time.monotonic() - started})
            break
        time.sleep(min(args.interval, max(0.01, args.hours * 3600 - (time.monotonic() - started))))

summary = {
    'status': completion, 'pid': args.pid, 'requested_hours': args.hours,
    'restart_count': restart_count, 'missing_count': missing_count,
    'continuous_run': restart_count == 0 and missing_count == 0,
    'sample_count': len(samples_summary), 'elapsed_seconds': round(time.monotonic() - started, 2),
    'rss_min_kib': min((row['rss_kib'] for row in samples_summary), default=None),
    'rss_max_kib': max((row['rss_kib'] for row in samples_summary), default=None),
    'rss_first_kib': samples_summary[0]['rss_kib'] if samples_summary else None,
    'rss_last_kib': samples_summary[-1]['rss_kib'] if samples_summary else None,
    'max_wall_gap_seconds': max((row['wall_gap_seconds'] for row in samples_summary), default=None),
    'scope': '不含独立 WebKit/GPU 进程；没有功耗数据；不自动判定验收通过',
}
args.output.with_suffix('.summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
