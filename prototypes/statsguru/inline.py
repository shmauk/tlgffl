"""PROTOTYPE: inline data.json into template.html -> statsguru-prototype.html."""
from pathlib import Path
here = Path(__file__).parent
html = (here / "template.html").read_text().replace("__DATA__", (here / "data.json").read_text())
(here / "statsguru-prototype.html").write_text(html)
