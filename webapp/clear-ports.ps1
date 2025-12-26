$ports = 8000..8004
Write-Output "Clearing ports: $($ports -join ', ')"
foreach ($p in $ports) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($pidToKill in $pids) {
                if ($pidToKill -and $pidToKill -ne $PID) {
                    Write-Output ("Killing PID {0} (port {1})" -f $pidToKill, $p)
                    try {
                        taskkill /PID $pidToKill /F | Out-Null
                        Write-Output ("Killed {0}" -f $pidToKill)
                    } catch {
                        Write-Output ("Failed to kill {0}: {1}" -f $pidToKill, $_.Exception.Message)
                    }
                }
            }
        } else {
            Write-Output "Port $p is free"
        }
    } catch {
        Write-Output ("Error checking port {0}: {1}" -f $p, $_.Exception.Message)
    }
}
Write-Output "Done clearing ports."
