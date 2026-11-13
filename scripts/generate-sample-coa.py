"""Generate the public sample COA. Requires reportlab; contains no lab results."""
from pathlib import Path
from shutil import copyfile

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/pdf/spectrum-biosciences-sample-coa.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
PURPLE = colors.HexColor("#55205F")
INK = colors.HexColor("#29232D")
MUTED = colors.HexColor("#756579")
PALE = colors.HexColor("#F8F0FA")
GOLD = colors.HexColor("#A87516")
c = canvas.Canvas(str(OUT), pagesize=A4)
c.setTitle("Spectrum Biosciences - Sample Certificate of Analysis")
c.setAuthor("Spectrum Biosciences")
c.setSubject("Demonstration template only. No verified analytical results.")
W, H = A4


def text(x, y, value, size=10, color=INK, bold=False):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.drawString(x, y, value)


def paragraph(value, x, top, width, size=10, color=MUTED):
    p = Paragraph(value, ParagraphStyle("body", fontName="Helvetica", fontSize=size,
        leading=size * 1.55, textColor=color, alignment=TA_LEFT))
    _, height = p.wrap(width, H)
    p.drawOn(c, x, top - height)
    return top - height


c.setFillColor(PURPLE)
c.rect(0, H - 10, W, 10, fill=1, stroke=0)
c.drawImage(str(ROOT / "public/assets/spectrum-logo.png"), 44, H - 106,
            width=175, height=64, preserveAspectRatio=True, anchor="c", mask="auto")
text(W - 154, H - 62, "QUALITY DOCUMENTATION", 8, GOLD, True)
text(44, H - 145, "Certificate of Analysis", 27, PURPLE, True)
text(44, H - 168, "SAMPLE / DEMONSTRATION TEMPLATE", 10, GOLD, True)
c.setFillColor(PALE)
c.roundRect(44, H - 253, W - 88, 62, 8, fill=1, stroke=0)
text(58, H - 213, "NOT A LAB-ISSUED CERTIFICATE", 11, PURPLE, True)
paragraph("No sample was analyzed. This document previews the COA format and must not be used as proof of testing or for product release.",
          58, H - 224, W - 116, 9)

text(44, H - 285, "01   SAMPLE IDENTIFICATION", 10, PURPLE, True)
for x, y, label, value in [
    (44, H - 311, "MATERIAL", "Demonstration material only"),
    (312, H - 311, "LOT / BATCH", "SAMPLE - no production lot"),
    (44, H - 354, "DOCUMENT ID", "SB-SAMPLE-COA-001"),
    (312, H - 354, "LABORATORY / ANALYSIS DATE", "Not applicable - sample document"),
]:
    text(x, y, label, 8, MUTED, True)
    text(x, y - 17, value, 10, INK)

text(44, H - 411, "02   ANALYTICAL PANEL - FORMAT PREVIEW", 10, PURPLE, True)
rows = [["ANALYSIS", "METHOD", "RESULT / STATUS"],
        ["Identity", "Not performed", "No verified result"],
        ["Purity", "Not performed", "No verified result"],
        ["Measured content", "Not performed", "No verified result"],
        ["Residual solvents", "Not performed", "No verified result"],
        ["Heavy metals", "Not performed", "No verified result"],
        ["Sterility", "Not performed", "No verified result"],
        ["Endotoxins", "Not performed", "No verified result"]]
table = Table(rows, colWidths=[166, 145, W - 399], rowHeights=27)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("TEXTCOLOR", (0, 1), (-1, -1), INK),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [PALE, colors.white]),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 11),
]))
table.wrapOn(c, W - 88, H)
table.drawOn(c, 44, H - 642)
paragraph("A valid batch COA must identify the tested material, production lot, issuing laboratory, analysis date, methods and authenticated results. No acceptance criteria, pass status or laboratory approval is claimed here.",
          44, H - 663, W - 88, 9)
c.setStrokeColor(colors.HexColor("#E8DCEA"))
c.line(44, 65, W - 44, 65)
text(44, 47, "Spectrum Biosciences | Sample only | Research use only", 8, MUTED)
text(W - 90, 47, "1 / 1", 8, MUTED)
c.save()
copyfile(OUT, ROOT / "public/assets/certificate.pdf")
print(OUT)
