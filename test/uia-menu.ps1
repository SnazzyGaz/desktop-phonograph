# Invoke an item of the open popup menu of a process tree through UI Automation (the real native menu, no mouse).
# Usage: uia-menu.ps1 <"Item" or "Submenu>Item"> <root pid>
param([string]$path,[int]$root)
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$all=Get-CimInstance Win32_Process;$set=@($root);$g=$true;while($g){$g=$false;foreach($p in $all){if($set -notcontains $p.ProcessId -and $set -contains $p.ParentProcessId){$set+=$p.ProcessId;$g=$true}}}
$A=[System.Windows.Automation.AutomationElement];$T=[System.Windows.Automation.ControlType]
$cond=New-Object System.Windows.Automation.OrCondition((New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty,$T::MenuItem)),(New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty,$T::CheckBox)),(New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty,$T::RadioButton)))
function find($name){$deadline=(Get-Date).AddSeconds(5);$seen=@()
 while((Get-Date) -lt $deadline){
  foreach($t in $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)){
   if($set -notcontains $t.Current.ProcessId){continue}
   foreach($m in $t.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond)){$seen+=$m.Current.Name;if($m.Current.Name -eq $name){return $m}}}
  Start-Sleep -Milliseconds 250}
 throw ("not found: $name; seen: "+(($seen|Select -Unique) -join ' | '))}
try{
 $parts=$path -split '>';$el=$null
 for($i=0;$i -lt $parts.Count;$i++){
  $el=find $parts[$i];$o=$null
  if($i -lt $parts.Count-1){if($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern,[ref]$o)){$o.Expand()}else{$el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()};Start-Sleep -Milliseconds 400;continue}
  if($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$o)){$o.Invoke();'INVOKED'}
  elseif($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern,[ref]$o)){$o.Toggle();'TOGGLED'}
  elseif($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$o)){$o.Select();'SELECTED'}
  else{'NOPATTERN'}}
}catch{'FAIL '+$_.Exception.Message}
