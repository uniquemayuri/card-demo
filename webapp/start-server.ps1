# start-server.ps1
# Ensures port 8000 is free, kills any process using it, then starts serve.js on port 8000
$port = 8000
Write-Output "Ensuring port $port is free..."
try{
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if($conns){
        $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach($pid in $pids){
            if($pid -and $pid -ne $PID){
                Write-Output ("Killing PID {0} on port {1}" -f $pid, $port)
                taskkill /PID $pid /F | Out-Null
            }
        }
    } else { Write-Output "Port $port was already free." }
}catch{ Write-Output ("Error checking port {0}: {1}" -f $port, $_.Exception.Message) }

# Start server
$cwd = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Output ("Starting server in {0}" -f $cwd)
Start-Process -FilePath node -ArgumentList "serve.js $port" -WorkingDirectory $cwd -WindowStyle Minimized
Write-Output "Server started (node serve.js $port) -- check http://127.0.0.1:$port/"
