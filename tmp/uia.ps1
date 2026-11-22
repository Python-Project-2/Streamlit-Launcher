Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$pidExcel = (Get-Process EXCEL -ErrorAction SilentlyContinue | Select-Object -First 1).Id
if (-not $pidExcel) { 'no excel'; exit }
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $pidExcel)
$wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
foreach ($w in $wins) {
  "WINDOW: $($w.Current.Name) | $($w.Current.ClassName) | offscreen=$($w.Current.IsOffscreen)"
  $all = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $all) {
    if ($e.Current.Name) { "   [$($e.Current.ControlType.ProgrammaticName)] $($e.Current.Name)" }
  }
}
