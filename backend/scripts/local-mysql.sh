#!/bin/sh
# macOS + Homebrew: reuse this project's existing MySQL data directory.
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
local_dir="$project_dir/.local"
data_dir="$local_dir/mysql-data"
pid_file="$local_dir/lostquest-mysql.pid"
service_domain="gui/$(id -u)"
service_label="com.lostquest.mysql"
service_target="$service_domain/$service_label"
plist_file="$local_dir/launchagents/$service_label.plist"

running() {
    [ -f "$pid_file" ] || return 1
    pid=$(cat "$pid_file")
    case "$pid" in ''|*[!0-9]*) return 1 ;; esac
    kill -0 "$pid" 2>/dev/null || return 1
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | rg -Fx -- "n$data_dir" >/dev/null
}

case "${1:-status}" in
    start)
        if running; then
            printf 'Project MySQL is already running (PID %s).\n' "$pid"
            exit 0
        fi
        if lsof -nP -iTCP:3306 -sTCP:LISTEN >/dev/null 2>&1; then
            printf 'Port 3306 is in use. Stop the other MySQL instance before starting this one.\n' >&2
            exit 1
        fi
        if [ ! -f "$data_dir/mysql.ibd" ]; then
            printf 'Existing project database was not found: %s\n' "$data_dir" >&2
            exit 1
        fi
        mysql_prefix=$(brew --prefix mysql@8.4)
        mkdir -p "$local_dir/launchagents"
        python3 - "$project_dir" "$mysql_prefix" "$plist_file" <<'PY'
import pathlib, plistlib, sys
project = pathlib.Path(sys.argv[1])
prefix = pathlib.Path(sys.argv[2])
local = project / '.local'
config = {
    'Label': 'com.lostquest.mysql',
    'ProgramArguments': [
        str(prefix / 'bin/mysqld'), '--no-defaults',
        f'--basedir={prefix}', f'--datadir={local / "mysql-data"}',
        '--bind-address=127.0.0.1', '--mysqlx-bind-address=127.0.0.1', '--port=3306',
        f'--socket={local / "mysql.sock"}', f'--pid-file={local / "lostquest-mysql.pid"}',
        f'--log-error={local / "mysql.log"}',
    ],
    'WorkingDirectory': str(project),
    'RunAtLoad': True,
    'KeepAlive': True,
    'ThrottleInterval': 5,
    'StandardOutPath': str(local / 'mysql-launch.log'),
    'StandardErrorPath': str(local / 'mysql-launch.log'),
}
with open(sys.argv[3], 'wb') as output:
    plistlib.dump(config, output)
PY
        if launchctl print "$service_target" >/dev/null 2>&1; then
            launchctl kickstart "$service_target"
        else
            launchctl bootstrap "$service_domain" "$plist_file"
        fi
        attempt=0
        while [ "$attempt" -lt 20 ]; do
            if running && lsof -nP -a -p "$pid" -iTCP:3306 -sTCP:LISTEN >/dev/null 2>&1; then
                printf 'Project MySQL started at 127.0.0.1:3306 (PID %s).\n' "$pid"
                printf 'Data directory: %s\n' "$data_dir"
                exit 0
            fi
            attempt=$((attempt + 1))
            sleep 1
        done
        printf 'MySQL did not start. See %s and %s.\n' "$local_dir/mysql.log" "$local_dir/mysql-launch.log" >&2
        exit 1
        ;;
    stop)
        if ! launchctl print "$service_target" >/dev/null 2>&1; then
            printf 'Project MySQL is not running.\n'
            exit 0
        fi
        pid=''
        if running; then
            stopped_pid="$pid"
        else
            stopped_pid=''
        fi
        launchctl bootout "$service_target"
        attempt=0
        while [ -n "$stopped_pid" ] && kill -0 "$stopped_pid" 2>/dev/null; do
            if [ "$attempt" -ge 40 ]; then
                printf 'MySQL is still shutting down; no forced termination was used.\n' >&2
                exit 1
            fi
            attempt=$((attempt + 1))
            sleep 1
        done
        printf 'Project MySQL stopped.\n'
        ;;
    status)
        if running; then
            printf 'Project MySQL is running (PID %s).\n' "$pid"
            printf 'Data directory: %s\n' "$data_dir"
        else
            printf 'Project MySQL is not running.\n'
            exit 1
        fi
        ;;
    *)
        printf 'Usage: sh %s start|stop|status\n' "$0" >&2
        exit 2
        ;;
esac
