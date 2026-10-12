"""PROTOTYPE: inline data.json and the extra variants into template.html -> visual-design-prototype.html."""
from pathlib import Path
here = Path(__file__).parent
html = (here / "template.html").read_text()
html = html.replace("/*__CSS2__*/", (here / "more-variants.css").read_text())
html = html.replace("//__JS2__", (here / "more-variants.js").read_text())
html = html.replace("__DATA__", (here / "data.json").read_text())
(here / "visual-design-prototype.html").write_text(html)
