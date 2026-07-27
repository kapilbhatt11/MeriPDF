import { toast } from "react-hot-toast";

export interface PDFLog {
  id: string;
  toolName: string;
  timestamp: string;
  pagesCount: number;
  savings: number; // estimated savings in INR
  timeSaved: number; // estimated time saved in minutes
}

export function logPDFOperation(toolName: string, pagesCount: number) {
  if (typeof window === "undefined") return;
  (window as any).__last_logged_at = Date.now();
  try {
    const listRaw = localStorage.getItem("meripdf_analytics_history");
    const list: PDFLog[] = listRaw ? JSON.parse(listRaw) : [];
    
    // We estimate page and tool specific savings
    const count = Math.max(pagesCount, 1);
    let moneySaved = count * 5;
    let minutesSaved = 5;

    const lowerName = toolName.toLowerCase();
    if (lowerName.includes("merge") || lowerName.includes("organize") || lowerName.includes("remove") || lowerName.includes("extract")) {
      moneySaved = 25 + (count * 5);
      minutesSaved = 10 + (count * 1);
    } else if (lowerName.includes("split")) {
      moneySaved = 35;
      minutesSaved = 8;
    } else if (lowerName.includes("compress")) {
      moneySaved = 45;
      minutesSaved = 5;
    } else if (lowerName.includes("scan") || lowerName.includes("ocr")) {
      moneySaved = 50 + (count * 10);
      minutesSaved = 15 + (count * 3);
    } else if (lowerName.includes("repair")) {
      moneySaved = 100;
      minutesSaved = 20;
    } else if (lowerName.includes("watermark") || lowerName.includes("page-number") || lowerName.includes("protect") || lowerName.includes("unlock")) {
      moneySaved = 30;
      minutesSaved = 6;
    } else {
      moneySaved = 20;
      minutesSaved = 5;
    }

    const newLog: PDFLog = {
      id: Math.random().toString(36).substring(2, 9),
      toolName,
      timestamp: new Date().toISOString(),
      pagesCount: count,
      savings: moneySaved,
      timeSaved: minutesSaved
    };
    
    list.unshift(newLog);
    if (list.length > 50) {
      list.pop(); // keep last 50 entries
    }
    
    localStorage.setItem("meripdf_analytics_history", JSON.stringify(list));
    
    // Calculate total savings to display in toast
    const totalSavings = list.reduce((acc, curr) => acc + (curr.savings || 0), 0);

    // Fire local window event to refresh Navbar badges
    window.dispatchEvent(new Event("pdf-activity-completed"));

    // Premium positive reward alert toast
    toast.success(
      `🎉 Task Complete! You saved ₹${moneySaved} & ${minutesSaved} minutes! Total Savings: ₹${totalSavings}`,
      {
        duration: 5000,
        position: "top-center",
        style: {
          background: '#f0fdf4',
          border: '1.5px solid #16a34a',
          color: '#14532d',
          fontWeight: 'bold',
          borderRadius: '1rem',
          padding: '12px 16px',
        }
      }
    );
  } catch (e) {
    console.error("Failed to log analytics:", e);
  }
}

export function getPDFAnalyticsHistory(): PDFLog[] {
  if (typeof window === "undefined") return [];
  try {
    const listRaw = localStorage.getItem("meripdf_analytics_history");
    return listRaw ? JSON.parse(listRaw) : [];
  } catch {
    return [];
  }
}

export function getPDFAnalyticsSummary() {
  const history = getPDFAnalyticsHistory();
  const totalOps = history.length;
  const totalPages = history.reduce((acc, curr) => acc + curr.pagesCount, 0);
  const totalSavings = history.reduce((acc, curr) => acc + (curr.savings || 0), 0);
  
  return {
    totalOps,
    totalPages,
    totalSavings,
    history
  };
}
