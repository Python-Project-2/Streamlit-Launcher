Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'NUIDialog')
    $dlgs = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
    foreach ($d in $dlgs) {
        if ($d.Current.Name -eq 'Microsoft Excel') {
            $btnCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'OK')
            $ok = $d.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
            if ($ok) {
                $ok.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
                Write-Output 'clicked'
                exit
            }
        }
    }
    Start-Sleep -Milliseconds 400
}
