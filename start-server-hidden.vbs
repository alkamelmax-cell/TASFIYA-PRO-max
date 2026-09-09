Option Explicit

Dim shell, fileSystem, serverRoot, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

serverRoot = fileSystem.GetParentFolderName(WScript.ScriptFullName)
command = Chr(34) & serverRoot & "\start-server.cmd" & Chr(34) & " --worker"

' Window style 0 keeps the long-running Node console completely hidden.
shell.Run command, 0, False
