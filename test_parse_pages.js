const parsePages = (pagesStr, totalPages) => {
  if (!pagesStr || pagesStr.trim() === "all" || pagesStr.trim() === "") {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const result = new Set();
  const parts = pagesStr.split(",");
  for (const part of parts) {
    const p = part.trim();
    if (p.includes("-")) {
      const [start, end] = p.split("-").map(Number);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) result.add(i);
      }
    } else {
      const pNum = Number(p);
      if (!isNaN(pNum)) result.add(pNum);
    }
  }
  return Array.from(result).filter((n) => n > 0 && n <= totalPages).sort((a, b) => a - b);
};

let customPages = "1, 2, 3, 4, 5".split(", ").filter(x => x !== "3").join(", ");
console.log("customPages after remove:", customPages);
console.log("parsed:", parsePages(customPages, 5));

customPages = "1".split(", ").filter(x => x !== "1").join(", ");
console.log("customPages after remove last:", customPages);
console.log("parsed:", parsePages(customPages, 5));

