p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("OUT = os.path.abspath('output/SuperMarket Analysis-aplikasi.xlsm')",
              "OUT = os.path.abspath('output/SuperMarket Analysis-aplikasi.xlsm')\nTMP_OUT = os.path.abspath('tmp/app-out.xlsm')")
s = s.replace("wb.SaveAs(OUT, FileFormat=52)", "wb.SaveAs(TMP_OUT, FileFormat=52)")
s = s.replace("print('saved', OUT, os.path.getsize(OUT))", "print('saved', TMP_OUT, os.path.getsize(TMP_OUT))")
s = s.replace("wb.Close(SaveChanges=False)\nxl.Quit()", "wb.Close(SaveChanges=False)\nxl.Quit()\nshutil.copyfile(TMP_OUT, OUT)\nprint('copied', OUT, os.path.getsize(OUT))")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
