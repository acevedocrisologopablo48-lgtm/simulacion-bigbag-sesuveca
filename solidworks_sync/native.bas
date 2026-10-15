Attribute VB_Name = "NativeP05"
Option Explicit
Private P05App As Object, P05FSO As Object, P05Parts As Object, P05Rows As Collection
Private P05Root As String, P05SHA As String, P05Report As Object
Private Const P05Remote As String = "https://raw.githubusercontent.com/acevedocrisologopablo48-lgtm/simulacion-bigbag-sesuveca/codex/p05-solidworks-sync/solidworks_sync/"
Private Const P05State As String = "P05 - EMISION CONSOLIDADA PARA REVISION TECNICA"

' All dimensions and paper coordinates use metres internally.
' Actual model views remain linked to the SLDASM/SLDPRT documents.
' No name, signature, load test or manufacturer certification is inferred.
Private P05DApp As Object, P05DModel As Object, P05DDraw As Object
Private P05DRoot As String, P05DLogFile As Integer
Private P05DViews As Long, P05DDims As Long
Private Const P05DState As String = "P05 - EMISIÓN PARA REVISIÓN TÉCNICA"


Public Sub ActualizarTodoP05()
    On Error GoTo Failed
    Dim stream As Object, http As Object, shell As Object, zip As Object, dest As Object
    Dim source As Object, row As String, a As Variant, entry As Variant, doc As Object, part As Object
    Dim bodies As Variant, mass As Object, c As Long, count As Long, expectedParts As Long, expectedComp As Long
    Dim errors As Long, warnings As Long, ok As Boolean, color(8) As Double, volume As Double
    Dim deadline As Double, rootBase As String, docs As Variant, item As Variant
    Set P05App = Application.SldWorks
    Set P05FSO = CreateObject("Scripting.FileSystemObject")
    rootBase = "C:\Users\Public\Documents\PROYECTO IZAJE DE BIGBAG\"
    P05Root = rootBase & "P05_ACTUAL\"
    If Not P05FSO.FolderExists(P05Root) Then P05FSO.CreateFolder P05Root
    Set P05Report = P05FSO.CreateTextFile(P05Root & "VERIFICACION_NATIVA_P05.txt", True, False)
    P05Log "BIGBAG P05 CURRENT NATIVE 1"
    P05Log "@@SW|" & P05App.RevisionNumber
    ' Close only documents of this project to avoid same-name references from old revisions.
    docs = P05App.GetDocuments
    If Not IsEmpty(docs) Then
        For Each item In docs
            If InStr(1, item.GetPathName, "BIGBAG", vbTextCompare) > 0 Then
                If item.GetSaveFlag Then item.Save3 1, errors, warnings
                P05App.CloseDoc item.GetTitle
            End If
        Next item
    End If
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 15000, 15000, 15000, 120000
    http.Open "GET", P05Remote & "input.zip?current=" & CStr(CLng(Timer)), False
    http.send
    If http.Status <> 200 Then Err.Raise 8101, , "Descarga de geometria HTTP " & CStr(http.Status)
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 1: stream.Open: stream.Write http.responseBody
    stream.SaveToFile P05Root & "P05_INPUT.zip", 2: stream.Close
    Set shell = CreateObject("Shell.Application")
    Set zip = shell.NameSpace(CVar(P05Root & "P05_INPUT.zip"))
    Set dest = shell.NameSpace(CVar(P05Root))
    If zip Is Nothing Or dest Is Nothing Then Err.Raise 8102, , "No se reconoce ZIP de geometria"
    dest.CopyHere zip.Items, 20
    deadline = Timer
    Do While Not P05FSO.FileExists(P05Root & "INPUT_P05.txt")
        DoEvents
        If Timer - deadline > 120 Then Err.Raise 8103, , "Extraccion de entrada demorada"
    Loop
    Set source = P05FSO.OpenTextFile(P05Root & "INPUT_P05.txt", 1, False)
    If source.ReadLine <> "BIGBAG P05 CURRENT INPUT 1" Then Err.Raise 8104, , "Formato de entrada"
    Set P05Parts = CreateObject("Scripting.Dictionary")
    Set P05Rows = New Collection
    P05App.CommandInProgress = True
    P05App.DocumentVisible False, 1
    Do While Not source.AtEndOfStream
        row = source.ReadLine
        If row = "@@END" Then Exit Do
        a = Split(row, "|")
        Select Case CStr(a(0))
        Case "@@META"
            expectedParts = CLng(a(1)): expectedComp = CLng(a(2))
        Case "@@SHA"
            P05SHA = CStr(a(1)): P05Log "@@SHA|" & P05SHA
        Case "@@PART"
            deadline = Timer
            Do While Not P05FSO.FileExists(P05Root & "STEP_ORIGEN\" & a(1) & ".step")
                DoEvents
                If Timer - deadline > 120 Then Err.Raise 8105, , "Falta STEP " & a(1)
            Loop
            Set doc = Nothing
            If P05FSO.FileExists(P05Root & a(1) & ".SLDPRT") Then
                Set doc = P05App.OpenDoc6(P05Root & a(1) & ".SLDPRT", 1, 1, "", errors, warnings)
                If Not doc Is Nothing Then
                    If doc.Extension.CustomPropertyManager("").Get("P05ManifestSHA") <> P05SHA Then
                        P05App.CloseDoc doc.GetTitle: Set doc = Nothing
                    End If
                End If
            End If
            If doc Is Nothing Then
                Set entry = P05App.GetImportFileData(P05Root & "STEP_ORIGEN\" & a(1) & ".step")
                Set doc = P05App.NewDocument(P05App.GetDocumentTemplate(1, "", 0, 0, 0), 0, 0, 0)
                If doc Is Nothing Then Err.Raise 8106, , "Sin plantilla de pieza"
                Set doc = P05App.LoadFile4(P05Root & "STEP_ORIGEN\" & a(1) & ".step", "i", entry, errors)
            End If
            If doc Is Nothing Then Err.Raise 8107, , "No importa " & a(1)
            If doc.GetType <> 1 Then Err.Raise 8108, , "No es pieza " & a(1)
            Set part = doc
            bodies = part.GetBodies2(0, False)
            If IsEmpty(bodies) Then Err.Raise 8109, , "Sin solidos " & a(1)
            count = UBound(bodies) - LBound(bodies) + 1
            If count <> CLng(a(2)) Then Err.Raise 8110, , "Numero de cuerpos " & a(1)
            Set mass = doc.Extension.CreateMassProperty
            volume = mass.Volume
            If Abs(volume - Val(a(3))) > 0.00001 * Val(a(3)) + 0.000000000001 Then Err.Raise 8111, , "Volumen discordante " & a(1)
            color(0) = Val(a(4)): color(1) = Val(a(5)): color(2) = Val(a(6))
            color(3) = 1: color(4) = 0.6: color(5) = 0.25: color(6) = 0.3
            doc.MaterialPropertyValues = color
            doc.Extension.CustomPropertyManager("").Add3 "P05ManifestSHA", 30, P05SHA, 2
            doc.Extension.CustomPropertyManager("").Add3 "Revision", 30, "P05 actual - geometria STEP corregida", 2
            doc.Extension.CustomPropertyManager("").Add3 "Estado", 30, P05State, 2
            doc.Extension.CustomPropertyManager("").Add3 "Metodo", 30, "Solidos importados; sin historial parametrico ni mates cinematicos", 2
            doc.ClearSelection2 True: doc.ForceRebuild3 False
            P05Save doc, P05Root & a(1) & ".SLDPRT"
            P05Parts(CStr(a(1))) = P05Root & a(1) & ".SLDPRT"
            P05Log "@@PART|" & a(1) & "|" & CStr(count) & "|" & P05Number(volume)
            P05App.CloseDoc doc.GetTitle
        Case "@@COMP"
            P05Rows.Add row
        End Select
    Loop
    source.Close
    If P05Parts.Count <> expectedParts Or P05Rows.Count <> expectedComp Then Err.Raise 8112, , "Entrada incompleta"
    P05App.DocumentVisible False, 2
    P05BuildAssembly "ESTACION_BIGBAG_P05", "ALL"
    P05BuildAssembly "ESTRUCTURA_P05", "STRUCTURE"
    P05BuildAssembly "TOLVA_MECANISMOS_P05", "HOPPER"
    P05BuildAssembly "ACCESOS_P05", "ACCESS"
    P05BuildAssembly "CRUCETA_H_2t_P05", "SPREADER"
    P05BuildAssembly "COMPUERTA_P05", "GATE"
    P05BuildAssembly "CORTADOR_P05", "CUTTER"
    P05VerifyAssembly expectedComp
    P05App.CommandInProgress = False
    P05App.DocumentVisible True, 1: P05App.DocumentVisible True, 2
    P05Log "@@END|" & CStr(P05Parts.Count) & "|" & CStr(P05Rows.Count)
    P05Report.Close
    GenerarPlanos P05Root
    P05Pack rootBase & "P05_ACTUAL_NATIVOS.zip"
    MsgBox "P05 actualizado en SolidWorks. Nativos, planos y PDF en " & P05Root & vbCrLf & "Paquete: " & rootBase & "P05_ACTUAL_NATIVOS.zip"
    Exit Sub
Failed:
    Dim code As Long, description As String
    code = Err.Number: description = Err.Description
    On Error Resume Next
    P05App.CommandInProgress = False
    P05App.DocumentVisible True, 1: P05App.DocumentVisible True, 2
    P05Log "@@ERROR|" & CStr(code) & "|" & description
    P05Report.Close
    MsgBox "P05 " & CStr(code) & ": " & description
End Sub

Private Sub P05Save(ByVal doc As Object, ByVal path As String)
    Dim errors As Long, warnings As Long, ok As Boolean
    ok = doc.Extension.SaveAs(path, 0, 1, Nothing, errors, warnings)
    If Not ok Or errors <> 0 Then
        errors = doc.SaveAs3(path, 0, 2)
        If errors <> 0 Then Err.Raise 8120, , "No guarda " & path & " err=" & CStr(errors)
    End If
End Sub

Private Function P05Number(ByVal v As Double) As String
    P05Number = Replace(CStr(v), ",", ".")
End Function

Private Sub P05Log(ByVal s As String)
    If Not P05Report Is Nothing Then P05Report.WriteLine s
    P05App.SetStatusBarText s
    DoEvents
End Sub

Private Sub P05BuildAssembly(ByVal name As String, ByVal mode As String)
    Dim model As Object, ass As Object, comp As Object, doc As Object, active As Object, mu As Object
    Dim r As Variant, a As Variant, t(15) As Double, j As Long, n As Long, errors As Long, warnings As Long
    Dim selected As Boolean
    Set model = P05App.NewDocument(P05App.GetDocumentTemplate(2, "", 0, 0, 0), 0, 0, 0)
    If model Is Nothing Then Err.Raise 8121, , "Sin plantilla de conjunto"
    Set ass = model: Set mu = P05App.GetMathUtility
    model.ActiveView.EnableGraphicsUpdate = False
    For Each r In P05Rows
        a = Split(CStr(r), "|")
        selected = (mode = "ALL" Or mode = CStr(a(3)))
        If mode = "HOPPER" And (a(3) = "GATE" Or a(3) = "CUTTER") Then selected = True
        If selected Then
            Set doc = P05App.OpenDoc6(P05Parts(CStr(a(1))), 1, 1, "", errors, warnings)
            If doc Is Nothing Then Err.Raise 8122, , "No abre pieza " & a(1)
            Set active = P05App.ActivateDoc3(model.GetTitle, False, 0, errors)
            If active Is Nothing Then Err.Raise 8123, , "No activa conjunto " & name
            Set comp = ass.AddComponent5(P05Parts(CStr(a(1))), 0, "", False, "", 0, 0, 0)
            If comp Is Nothing Then Err.Raise 8124, , "No inserta " & a(2)
            model.ClearSelection2 True: comp.Select4 False, Nothing, False: ass.UnfixComponent
            For j = 0 To 15: t(j) = Val(CStr(a(j + 4))): Next j
            If mode = "SPREADER" Then
                t(9) = t(9) - 2.35: t(11) = t(11) - 4.235
            End If
            comp.Transform2 = mu.CreateTransform(t)
            On Error Resume Next
            comp.Name2 = Replace(CStr(a(2)), "/", "_")
            On Error GoTo 0
            model.ClearSelection2 True: comp.Select4 False, Nothing, False: ass.FixComponent
            n = n + 1
        End If
    Next r
    If n = 0 Or ass.GetComponentCount(False) <> n Then Err.Raise 8125, , "Recuento conjunto " & name
    model.ClearSelection2 True: model.ForceRebuild3 False
    model.Extension.CustomPropertyManager("").Add3 "P05ManifestSHA", 30, P05SHA, 2
    model.Extension.CustomPropertyManager("").Add3 "Estado", 30, P05State, 2
    model.ShowNamedView2 "*Isometric", 7: model.ViewZoomtofit2
    model.ActiveView.EnableGraphicsUpdate = True
    P05Save model, P05Root & name & ".SLDASM"
    P05Log "@@ASSEMBLY|" & name & "|" & CStr(n)
    P05App.CloseDoc model.GetTitle
End Sub

Private Sub P05VerifyAssembly(ByVal expected As Long)
    Dim model As Object, ass As Object, comp As Object, doc As Object, mass As Object, xf As Object, report As Object
    Dim comps As Variant, bodies As Variant, values As Variant, row As String, j As Long, n As Long, errors As Long, warnings As Long
    Set model = P05App.OpenDoc6(P05Root & "ESTACION_BIGBAG_P05.SLDASM", 2, 65, "", errors, warnings)
    If model Is Nothing Then Err.Raise 8130, , "No reabre conjunto"
    Set ass = model: ass.ResolveAllLightWeightComponents False
    comps = ass.GetComponents(False)
    If UBound(comps) + 1 <> expected Then Err.Raise 8131, , "Componentes en reapertura"
    Set report = P05FSO.CreateTextFile(P05Root & "REAPERTURA_P05.txt", True, False)
    report.WriteLine "BIGBAG P05 CURRENT REOPEN 1"
    report.WriteLine "@@SHA|" & P05SHA
    For Each comp In comps
        Set doc = comp.GetModelDoc2
        If doc Is Nothing Then Err.Raise 8132, , "Referencia no resuelta " & comp.Name2
        If LCase(Left(comp.GetPathName, Len(P05Root))) <> LCase(P05Root) Then Err.Raise 8133, , "Referencia fuera de carpeta " & comp.GetPathName
        bodies = doc.GetBodies2(0, False)
        If IsEmpty(bodies) Then Err.Raise 8134, , "Pieza sin cuerpo " & comp.Name2
        Set mass = doc.Extension.CreateMassProperty
        Set xf = comp.Transform2: values = xf.ArrayData
        row = "@@COMP|" & comp.Name2 & "|" & P05FSO.GetFileName(comp.GetPathName) & "|" & CStr(UBound(bodies) + 1) & "|" & P05Number(mass.Volume)
        For j = 0 To 15: row = row & "|" & P05Number(CDbl(values(j))): Next j
        report.WriteLine row: n = n + 1
    Next comp
    report.WriteLine "@@END|" & CStr(n): report.Close
    P05App.CloseDoc model.GetTitle
End Sub

Public Sub P05Pack(ByVal output As String)
    Dim shell As Object, zip As Object, file As Object, ext As String, stream As Object
    Dim bytes(21) As Byte, fh As Integer, deadline As Double, expected As Long
    bytes(0) = 80: bytes(1) = 75: bytes(2) = 5: bytes(3) = 6
    fh = FreeFile: Open output For Binary Access Write As #fh: Put #fh, , bytes: Close #fh
    Set shell = CreateObject("Shell.Application")
    Set zip = shell.NameSpace(CVar(output))
    For Each file In P05FSO.GetFolder(P05Root).Files
        ext = LCase(P05FSO.GetExtensionName(file.Name))
        If ext = "sldprt" Or ext = "sldasm" Or ext = "slddrw" Or ext = "pdf" Or ext = "log" Or file.Name = "VERIFICACION_NATIVA_P05.txt" Or file.Name = "REAPERTURA_P05.txt" Then
            zip.CopyHere CVar(file.Path), 20: expected = expected + 1
            deadline = Timer
            Do While zip.Items.Count < expected
                DoEvents
                If Timer - deadline > 90 Then Err.Raise 8140, , "Empaquetado ZIP demorado " & file.Name
            Loop
        End If
    Next file
End Sub

Public Sub ReemitirPlanosP05()
    Set P05App = Application.SldWorks
    Set P05FSO = CreateObject("Scripting.FileSystemObject")
    P05Root = "C:\Users\Public\Documents\PROYECTO IZAJE DE BIGBAG\P05_ACTUAL\"
    GenerarPlanos P05Root
    P05Pack "C:\Users\Public\Documents\PROYECTO IZAJE DE BIGBAG\P05_ACTUAL_NATIVOS.zip"
    MsgBox "Planos y paquete P05 regenerados."
End Sub

Public Sub GenerarPlanos(ByVal root As String)
    On Error GoTo Failed
    Dim template As String, sheet As Object, pdf As Object
    Dim errors As Long, warnings As Long, ok As Boolean, v As Object
    Dim i As Long, oldTitle As String
    Set P05DApp = Application.SldWorks
    P05DRoot = root
    If Right$(P05DRoot, 1) <> "\" Then P05DRoot = P05DRoot & "\"
    P05DLogFile = FreeFile
    Open P05DRoot & "PLANOS_SOLIDWORKS_P05.log" For Output As #P05DLogFile
    P05DLog "INICIO " & CStr(Now)
    P05DViews = 0: P05DDims = 0
    P05DRequire "ESTACION_BIGBAG_P05.SLDASM"
    P05DRequire "ESTRUCTURA_P05.SLDASM"
    P05DRequire "TOLVA_MECANISMOS_P05.SLDASM"
    P05DRequire "ACCESOS_P05.SLDASM"
    P05DRequire "CRUCETA_H_2t_P05.SLDASM"
    P05DRequire "COMPUERTA_P05.SLDASM"
    P05DRequire "CORTADOR_P05.SLDASM"
    P05DRequire "logo_sesuveca_original.bmp"
    template = P05DApp.GetUserPreferenceStringValue(10)
    If Len(template) = 0 Or Dir$(template) = "" Then template = P05DApp.GetDocumentTemplate(3, "", 10, 0.841, 0.594)
    If Len(template) = 0 Or Dir$(template) = "" Then Err.Raise vbObjectError + 105, , "Plantilla de dibujo .drwdot no configurada."
    P05DLog "PLANTILLA " & template
    Set P05DModel = P05DApp.NewDocument(template, 10, 0.841, 0.594)
    If P05DModel Is Nothing Then Err.Raise vbObjectError + 106, , "NewDocument no creó el dibujo."
    Set P05DDraw = P05DModel
    Set sheet = P05DDraw.GetCurrentSheet
    oldTitle = sheet.GetName
    sheet.SetName "IZA-P05-01"
    ok = P05DDraw.SetupSheet6("IZA-P05-01", 10, 13, 1#, 20#, False, "", 0.841, 0.594, "", True, 0.02, 0.02, 0.02, 0.02, 6, 8)
    If Not ok Then Err.Raise vbObjectError + 107, , "SetupSheet6 A1 falló."
    P05DFrame 1, "CONJUNTO GENERAL", "Vistas vinculadas al ensamblaje nativo P05. Cotas en mm."
    Set v = P05DView("ESTACION_BIGBAG_P05.SLDASM", "*Top", 50, 220, 240, 310, "ALZADO X-Z", True)
    Set v = P05DView("ESTACION_BIGBAG_P05.SLDASM", "*Right", 325, 220, 200, 310, "LATERAL Y-Z", True)
    Set v = P05DView("ESTACION_BIGBAG_P05.SLDASM", "*Isometric", 560, 220, 240, 310, "ISOMÉTRICO", False)
    Set v = P05DView("ESTACION_BIGBAG_P05.SLDASM", "*Front", 50, 55, 365, 120, "PLANTA X-Y", True)
    P05DNote 470, 196, "CRUCETA NOMINAL 2 000 kg  |  PROCESO DE BOLSA 1 000 kg", 3.3, True
    P05DNote 470, 185, "Cota de traslado: 3 520. Guarda superior: 3 430. Luz nominal: 90.", 3
    P05DNote 470, 174, "Enclavamientos, instalación y pruebas conforme memoria P05.", 3
    P05DNote 470, 163, "Las referencias comerciales se diferencian de las piezas fabricadas.", 3
    P05DCheckpoint 1

    P05DNewSheet 2, "ESTRUCTURA / BASES / IZAJE", "Pórticos, viga carril, apoyos y anclajes."
    Set v = P05DView("ESTRUCTURA_P05.SLDASM", "*Top", 50, 215, 330, 310, "ALZADO ESTRUCTURAL", True)
    Set v = P05DView("ESTRUCTURA_P05.SLDASM", "*Front", 420, 345, 355, 170, "PLANTA DE BASES", True)
    Set v = P05DPartView("BASE_PORTICO_360x360x35", "*Front", 425, 175, 155, 125, "PLACA PORTAL 360 x 360 x 35")
    Set v = P05DPartView("TC11_PASADOR_D30_L90_FY355_P05", "*Front", 610, 175, 165, 125, "PASADOR CAUTIVO D30 / L90")
    P05DNote 35, 192, "VIGA CARRIL: I armada 240 x 140 x 8 x 20; L = 3 600; pista Z = 5 720.", 3
    P05DNote 35, 180, "Anclajes activos: HAS-U 8.8 M16; hef = 275; L total = 400; HIT-RE 500 V4.", 3
    P05DNote 35, 168, "Losa suministrada: h = 650; f'c = 20,59 MPa. Patrón y grupos: modelo nativo.", 3
    P05DNote 35, 156, "Traba del carro: doble corte, pasador D30 Fy >= 355 MPa; orejas 2 x 12 / receptor 16.", 3
    P05DNote 35, 144, "No sustituir adaptadores propios por una supuesta brida normalizada del fabricante.", 3
    P05DCheckpoint 2

    P05DNewSheet 3, "TOLVA / CORTE / COMPUERTA", "Conjunto, cortador y accionamiento manual."
    Set v = P05DView("TOLVA_MECANISMOS_P05.SLDASM", "*Top", 45, 300, 285, 220, "ALZADO TOLVA", True)
    Set v = P05DView("TOLVA_MECANISMOS_P05.SLDASM", "*Front", 365, 350, 185, 170, "PLANTA / PARRILLA", True)
    Set v = P05DView("TOLVA_MECANISMOS_P05.SLDASM", "*Isometric", 590, 315, 200, 205, "ISOMÉTRICO TOLVA", False)
    Set v = P05DView("COMPUERTA_P05.SLDASM", "*Isometric", 45, 70, 360, 170, "COMPUERTA Y GUARDA", True)
    Set v = P05DView("CORTADOR_P05.SLDASM", "*Isometric", 465, 180, 305, 105, "CORTADOR AISI 304", False)
    P05DNote 35, 280, "Tolva: boca libre 1 650; salida 250; pared 60 grados; 2,30 m3 totales / 1,84 útiles.", 3
    P05DNote 35, 268, "UHMWPE disipativo t10: tramo recto 370,15. Dimensiones libres después del revestimiento.", 3
    P05DNote 35, 256, "Compuerta: cremallera-piñón manual; pasador cautivo; guarda 590 x 645 x 262.", 3
    P05DNote 465, 158, "Corte fijo de cuatro filos AISI 304. Mantener protección y acceso bloqueado.", 2.9
    P05DNote 465, 147, "Conexión DN150. Descarga por gravedad y captación sujetas a prueba funcional.", 2.9
    P05DCheckpoint 3

    P05DNewSheet 4, "ACCESOS / PLATAFORMA / BARANDAS", "Escalera, descansos y uniones del acceso desplazado 200 mm en Y."
    Set v = P05DView("ACCESOS_P05.SLDASM", "*Top", 50, 220, 420, 300, "ALZADO ACCESO", True)
    Set v = P05DView("ACCESOS_P05.SLDASM", "*Front", 520, 365, 260, 145, "PLANTA ACCESO", True)
    Set v = P05DView("ACCESOS_P05.SLDASM", "*Isometric", 520, 180, 260, 140, "ISOMÉTRICO ACCESO", False)
    P05DNote 35, 192, "Ensamblaje nativo con recortes de preparación y holguras geométricas de las uniones.", 3
    P05DNote 35, 180, "Barandas verificadas sin atribuir resistencia a las cartelas recortadas U05.", 3
    P05DNote 35, 168, "Conservar continuidad de columnas y sección de apoyo de los postes.", 3
    P05DNote 35, 156, "WPS, garganta efectiva y longitud útil de las uniones conforme detalle y memoria.", 3
    P05DNote 35, 144, "Pieza y posición se identifican por nombre en el ensamblaje y lista de materiales.", 3
    P05DCheckpoint 4

    P05DNewSheet 5, "CRUCETA 2 t / MATERIALES", "Dispositivo de izaje y lista de materiales vinculada al modelo."
    Set v = P05DView("CRUCETA_H_2t_P05.SLDASM", "*Front", 45, 315, 310, 205, "PLANTA CRUCETA", True)
    Set v = P05DView("CRUCETA_H_2t_P05.SLDASM", "*Top", 45, 155, 310, 110, "ALZADO CRUCETA", True)
    Set v = P05DView("CRUCETA_H_2t_P05.SLDASM", "*Isometric", 425, 365, 355, 155, "ISOMÉTRICO CRUCETA", False)
    P05DBom v
    P05DNote 35, 133, "Capacidad nominal 2 000 kg; vida de cálculo 125 000 izajes.", 3
    P05DNote 35, 121, "ASME BTH-1: categoría B / clase de servicio 2. Accesorios según memoria.", 3
    P05DNote 35, 109, "No atribuye inspecciones, prueba de carga o firma del responsable de ingeniería.", 3
    P05DNote 35, 97, "La lista de materiales conserva asociación con los componentes del ensamblaje.", 3
    P05DCheckpoint 5

    If P05DDraw.GetSheetCount <> 5 Then Err.Raise vbObjectError + 108, , "No se obtuvieron cinco hojas."
    P05DDraw.ActivateSheet "IZA-P05-01"
    P05DModel.ForceRebuild3 False
    P05DModel.ViewZoomtofit2
    ok = P05DModel.Extension.SaveAs(P05DRoot & "PLANOS_ESTACION_BIGBAG_P05.SLDDRW", 0, 1, Nothing, errors, warnings)
    P05DLog "GUARDADO SLDDRW=" & CStr(ok) & " ERR=" & CStr(errors) & " WARN=" & CStr(warnings)
    If Not ok Or errors <> 0 Then Err.Raise vbObjectError + 109, , "No se guardó el SLDDRW."
    Set pdf = P05DApp.GetExportFileData(1)
    pdf.ViewPdfAfterSaving = False
    ok = pdf.SetSheets(1, Empty)
    ok = P05DModel.Extension.SaveAs(P05DRoot & "PLANOS_SOLIDWORKS_P05.pdf", 0, 1, pdf, errors, warnings)
    P05DLog "GUARDADO PDF=" & CStr(ok) & " ERR=" & CStr(errors) & " WARN=" & CStr(warnings)
    If Not ok Or errors <> 0 Then Err.Raise vbObjectError + 110, , "No se exportó el PDF desde SOLIDWORKS."
    P05DLog "EXITO HOJAS=5 VISTAS=" & CStr(P05DViews) & " COTAS_NATIVAS=" & CStr(P05DDims)
    Close #P05DLogFile
    Exit Sub
Failed:
    On Error Resume Next
    P05DLog "ERROR " & CStr(Err.Number) & " " & Err.Description
    Close #P05DLogFile
    MsgBox "No se completó la emisión. Revisar PLANOS_SOLIDWORKS_P05.log", vbExclamation
End Sub

Private Sub P05DRequire(ByVal file As String)
    If Dir$(P05DRoot & file) = "" Then Err.Raise vbObjectError + 111, , "Falta modelo/asset: " & file
End Sub

Private Sub P05DLog(ByVal value As String)
    Print #P05DLogFile, value
    DoEvents
End Sub

Private Sub P05DNewSheet(ByVal n As Long, ByVal title As String, ByVal subtitle As String)
    Dim ok As Boolean, name As String
    name = "IZA-P05-" & Format$(n, "00")
    ok = P05DDraw.NewSheet4(name, 10, 13, 1#, 20#, False, "", 0.841, 0.594, "", 0.02, 0.02, 0.02, 0.02, 6, 8)
    If Not ok Then Err.Raise vbObjectError + 112, , "No se creó la hoja " & name
    P05DDraw.ActivateSheet name
    P05DFrame n, title, subtitle
End Sub

Private Sub P05DCheckpoint(ByVal n As Long)
    P05DDraw.ActivateView ""
    P05DModel.ClearSelection2 True
    P05DModel.ForceRebuild3 False
    P05DLog "HOJA=" & CStr(n) & " VISTAS_ACUM=" & CStr(P05DViews) & " COTAS_ACUM=" & CStr(P05DDims)
End Sub

Private Sub P05DLine(ByVal x As Double, ByVal y As Double, ByVal xx As Double, ByVal yy As Double)
    Dim e As Object
    Set e = P05DModel.SketchManager.CreateLine(x / 1000, y / 1000, 0, xx / 1000, yy / 1000, 0)
End Sub

Private Sub P05DRect(ByVal x As Double, ByVal y As Double, ByVal w As Double, ByVal h As Double)
    P05DLine x, y, x + w, y: P05DLine x + w, y, x + w, y + h
    P05DLine x + w, y + h, x, y + h: P05DLine x, y + h, x, y
End Sub

Private Sub P05DNote(ByVal x As Double, ByVal y As Double, ByVal value As String, Optional ByVal height As Double = 3#, Optional ByVal bold As Boolean = False)
    Dim nt As Object, a As Object, tf As Object
    P05DModel.ClearSelection2 True
    Set nt = P05DModel.InsertNote(value)
    If nt Is Nothing Then Err.Raise vbObjectError + 113, , "No se creó la nota: " & value
    Set a = nt.GetAnnotation
    a.SetPosition2 x / 1000, y / 1000, 0
    On Error Resume Next
    Set tf = a.GetTextFormat(0)
    tf.CharHeight = height / 1000
    tf.TypeFaceName = "Arial"
    tf.Bold = bold
    a.SetTextFormat 0, False, tf
    nt.LockPosition = True
    On Error GoTo 0
End Sub

Private Sub P05DFrame(ByVal n As Long, ByVal title As String, ByVal subtitle As String)
    Dim i As Long, x As Double, y As Double, pic As Object
    P05DDraw.EditTemplate
    P05DModel.ClearSelection2 True
    P05DModel.SketchManager.AddToDB = True
    P05DRect 10, 10, 821, 574: P05DRect 20, 20, 801, 554
    For i = 1 To 7
        x = 20 + i * 801 / 8
        P05DLine x, 574, x, 584: P05DLine x, 10, x, 20
    Next i
    For i = 1 To 5
        y = 20 + i * 554 / 6
        P05DLine 10, y, 20, y: P05DLine 821, y, 831, y
    Next i
    x = 461: y = 20
    P05DRect x, y, 360, 110
    P05DLine x + 110, y, x + 110, y + 110
    P05DLine x + 165, y, x + 165, y + 110
    P05DLine x + 198, y, x + 198, y + 110
    P05DLine x + 15, y + 32, x + 15, y + 76
    P05DLine x, y + 8, x + 360, y + 8
    P05DLine x, y + 32, x + 360, y + 32
    P05DLine x, y + 76, x + 360, y + 76
    P05DLine x, y + 98, x + 360, y + 98
    P05DLine x + 306, y, x + 306, y + 32
    P05DLine x + 306, y + 98, x + 306, y + 110
    For i = 0 To 4
        P05DLine x, y + 40 + i * 8, x + 198, y + 40 + i * 8
    Next i
    P05DLine x + 54, y + 32, x + 54, y + 76
    P05DLine x + 88, y + 32, x + 88, y + 76
    P05DModel.SketchManager.AddToDB = False
    Set pic = P05DModel.SketchManager.InsertSketchPicture(P05DRoot & "logo_sesuveca_original.bmp")
    If pic Is Nothing Then Err.Raise vbObjectError + 114, , "No se insertó el logo SESUVECA."
    pic.SetOrigin 0.54, 0.1
    pic.SetSize 0.098, 0.021, True
    P05DNote x + 5, y + 108, "ESTACIÓN BIGBAG", 3.6, True
    P05DNote x + 313, y + 108, "P05", 5, True
    P05DNote x + 4, y + 94, "SESUVECA DEL PERÚ", 2.7, True
    P05DNote x + 18, y + 75, "NOMBRE", 2.5
    P05DNote x + 59, y + 75, "FIRMA", 2.5
    P05DNote x + 91, y + 75, "FECHA", 2.5
    P05DNote x + 1, y + 66, "DIBUJ.", 2.5
    P05DNote x + 17, y + 66, "PROYECTO P05", 2.5
    P05DNote x + 89, y + 66, Format$(Date, "dd/mm/yyyy"), 2.3
    P05DNote x + 1, y + 58, "VERIF.", 2.5
    P05DNote x + 1, y + 50, "APROB.", 2.5
    P05DNote x + 1, y + 42, "FABR.", 2.5
    P05DNote x + 200, y + 74, "TÍTULO:", 2.6
    P05DNote x + 201, y + 62, title, 3.6, True
    P05DNote x + 112, y + 30, "MATERIAL:", 2.5
    P05DNote x + 112, y + 23, "SEGÚN DESPIECE", 2.6
    P05DNote x + 200, y + 30, "PROYECTO:", 2.6
    P05DNote x + 200, y + 22, "ESTACIÓN DE DESCARGA BIGBAG", 3.1, True
    P05DNote x + 319, y + 24, "A1", 6, True
    P05DNote x + 2, y + 7, "PESO: SEGÚN MODELO", 2.4
    P05DNote x + 112, y + 7, "ESCALA: INDICADA", 2.4
    P05DNote x + 200, y + 7, "IZA-P05-" & Format$(n, "00"), 2.8, True
    P05DNote x + 309, y + 7, "HOJA " & CStr(n) & " / 5", 2.6
    For i = 0 To 7
        P05DNote 20 + i * 801 / 8 + 46, 582, CStr(8 - i), 3.2
        P05DNote 20 + i * 801 / 8 + 46, 18, CStr(8 - i), 3.2
    Next i
    For i = 0 To 5
        P05DNote 13, 20 + i * 554 / 6 + 48, Chr$(65 + i), 3.2
        P05DNote 824, 20 + i * 554 / 6 + 48, Chr$(65 + i), 3.2
    Next i
    P05DDraw.EditSheet
    P05DNote 30, 567, title, 5.5, True
    P05DNote 30, 554, subtitle, 3
    P05DNote 464, 140, P05DState, 3.2, True
End Sub

Private Function P05DView(ByVal file As String, ByVal orientation As String, ByVal x As Double, ByVal y As Double, ByVal w As Double, ByVal h As Double, ByVal caption As String, ByVal dimensions As Boolean) As Object
    Dim v As Object, b As Variant, p As Variant
    Dim sc As Double, fit As Double, den As Double, i As Long
    Dim scales As Variant, desiredX As Double, desiredY As Double
    P05DDraw.ActivateView ""
    P05DModel.ClearSelection2 True
    Set v = P05DDraw.CreateDrawViewFromModelView3(P05DRoot & file, orientation, (x + w / 2) / 1000, (y + h / 2) / 1000, 0)
    If v Is Nothing Then Err.Raise vbObjectError + 115, , "No se creó la vista: " & file & " " & orientation
    v.UseSheetScale = False
    v.ScaleDecimal = 0.05
    P05DModel.ForceRebuild3 False
    b = v.GetOutline
    fit = (w - 18) / 1000 / (b(2) - b(0))
    If (h - 18) / 1000 / (b(3) - b(1)) < fit Then fit = (h - 18) / 1000 / (b(3) - b(1))
    sc = v.ScaleDecimal * fit
    scales = Array(1#, 2#, 2.5, 5#, 10#, 15#, 20#, 25#, 30#, 40#, 50#, 75#, 100#, 150#, 200#)
    den = 200
    For i = LBound(scales) To UBound(scales)
        If 1 / scales(i) <= sc Then den = scales(i): Exit For
    Next i
    v.ScaleDecimal = 1 / den
    P05DModel.ForceRebuild3 False
    b = v.GetOutline: p = v.Position
    desiredX = (x + w / 2) / 1000: desiredY = (y + h / 2) / 1000
    p(0) = p(0) + desiredX - (b(0) + b(2)) / 2
    p(1) = p(1) + desiredY - (b(1) + b(3)) / 2
    v.Position = p
    P05DViews = P05DViews + 1
    P05DLog "VISTA " & v.GetName2 & " " & file & " " & orientation & " ESCALA=1:" & CStr(den)
    P05DDraw.ActivateView ""
    P05DNote x, y + h + 9, caption & "  ESC. 1:" & CStr(den), 3.3, True
    If dimensions Then P05DOverallDimensions v
    P05DDraw.ActivateView ""
    Set P05DView = v
End Function

Private Function P05DPartView(ByVal stem As String, ByVal orientation As String, ByVal x As Double, ByVal y As Double, ByVal w As Double, ByVal h As Double, ByVal caption As String) As Object
    Dim folders As Variant, folder As Variant, file As String
    folders = Array("", "piezas\", "Piezas\", "parts\", "PIEZAS\")
    For Each folder In folders
        file = CStr(folder) & stem & ".SLDPRT"
        If Dir$(P05DRoot & file) <> "" Then
            Set P05DPartView = P05DView(file, orientation, x, y, w, h, caption, True)
            Exit Function
        End If
    Next folder
    P05DLog "DETALLE_SIN_PIEZA " & stem
    P05DNote x, y + h / 2, caption & ": ver componente del ensamblaje.", 3
End Function

Private Sub P05DOverallDimensions(ByVal v As Object)
    ' Select actual visible model vertices in this drawing view. If an entity
    ' is not selectable, record it; never replace it with a false dimension.
    On Error GoTo NoDimension
    Dim comps As Variant, verts As Variant, comp As Variant, vertex As Variant
    Dim math As Object, pt As Object, tr As Object, sd As Object, d As Object
    Dim q As Variant, b As Variant, minX As Double, maxX As Double, minY As Double, maxY As Double
    Dim exMin As SldWorks.Entity, exMax As SldWorks.Entity
    Dim eyMin As SldWorks.Entity, eyMax As SldWorks.Entity
    Dim n As Long, errValue As Long, errText As String
    minX = 1E+30: minY = 1E+30: maxX = -1E+30: maxY = -1E+30
    Set math = P05DApp.GetMathUtility
    Set tr = v.ModelToViewTransform
    comps = v.GetVisibleComponents
    If IsEmpty(comps) Then GoTo NoDimension
    For Each comp In comps
        verts = v.GetVisibleEntities2(comp, 2)
        If Not IsEmpty(verts) Then
            For Each vertex In verts
                q = vertex.GetPoint
                Set pt = math.CreatePoint(q)
                If Not comp Is Nothing Then Set pt = pt.MultiplyTransform(comp.Transform2)
                Set pt = pt.MultiplyTransform(tr)
                q = pt.ArrayData
                If q(0) < minX Then minX = q(0): Set exMin = vertex
                If q(0) > maxX Then maxX = q(0): Set exMax = vertex
                If q(1) < minY Then minY = q(1): Set eyMin = vertex
                If q(1) > maxY Then maxY = q(1): Set eyMax = vertex
                n = n + 1
            Next vertex
        End If
    Next comp
    If n < 2 Then GoTo NoDimension
    Set sd = P05DModel.SelectionManager.CreateSelectData
    Set sd.View = v
    P05DDraw.ActivateView v.GetName2
    P05DModel.ClearSelection2 True
    If exMin.Select4(False, sd) And exMax.Select4(True, sd) Then
        Set d = P05DModel.AddHorizontalDimension2((minX + maxX) / 2, minY - 0.009, 0)
        If Not d Is Nothing Then P05DDims = P05DDims + 1
    End If
    P05DModel.ClearSelection2 True
    If eyMin.Select4(False, sd) And eyMax.Select4(True, sd) Then
        Set d = P05DModel.AddVerticalDimension2(minX - 0.009, (minY + maxY) / 2, 0)
        If Not d Is Nothing Then P05DDims = P05DDims + 1
    End If
    P05DModel.ClearSelection2 True
    P05DDraw.ActivateView ""
    Exit Sub
NoDimension:
    errValue = Err.Number: errText = Err.Description
    On Error Resume Next
    P05DModel.ClearSelection2 True
    P05DDraw.ActivateView ""
    P05DLog "COTAS_VISTA " & v.GetName2 & " VERTICES=" & CStr(n) & " ERROR=" & CStr(errValue) & " " & errText
End Sub

Private Sub P05DBom(ByVal v As Object)
    On Error GoTo NoBom
    Dim bom As Object, t As Object, fmt As Object, i As Long
    Set bom = v.InsertBomTable4(False, 0.41, 0.32, 1, 1, "Default", "", False, 0, False)
    If bom Is Nothing Then GoTo NoBom
    Set t = bom
    For i = 0 To t.ColumnCount - 1
        t.SetColumnWidth i, 0.1, 0
    Next i
    Set fmt = t.GetTextFormat
    fmt.CharHeight = 0.0025
    t.SetTextFormat False, fmt
    P05DLog "BOM NATIVA FILAS=" & CStr(t.RowCount)
    Exit Sub
NoBom:
    On Error Resume Next
    P05DLog "BOM_ERROR " & CStr(Err.Number) & " " & Err.Description
    P05DNote 425, 319, "LISTA DE MATERIALES: consultar ensamblaje CRUCETA_H_2t_P05.", 3
End Sub

