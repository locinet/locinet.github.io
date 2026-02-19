import pymupdf  # imports the library

def extract_toc(pdf_file_path):
    """
    Extracts the table of contents (TOC) from a PDF file.
    """
    doc = pymupdf.open(pdf_file_path)
    toc = doc.get_toc()  # get the TOC

    if not toc:
        print(f"No table of contents/bookmarks found in {pdf_file_path}")
        doc.close()
        return

    print(f"Table of Contents for {pdf_file_path}:")
    # Iterate through the TOC entries
    for level, title, page_num, *rest in toc:
        # Indent based on the hierarchy level
        indent = "  " * (level - 1)
        print(f"{indent}* {title} (Page: {page_num})")
    
    doc.close()

# Example usage:
# Replace "your_document.pdf" with the path to your PDF file

