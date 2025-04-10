// arXiv-focused background script
console.log('arXiv PDF Renamer background script loaded');

// Store extracted titles from pages
let extractedTitles = {};

// Function to extract arXiv ID from URL
function extractArxivId(url) {
  try {
    // Try to match PDF URL pattern
    const pdfMatch = url.match(/arxiv\.org\/pdf\/([\d\.v]+)(?:\.pdf)?/i);
    if (pdfMatch && pdfMatch[1]) {
      return pdfMatch[1];
    }
    
    // Try to match abstract URL pattern
    const absMatch = url.match(/arxiv\.org\/abs\/([\d\.v]+)/i);
    if (absMatch && absMatch[1]) {
      return absMatch[1];
    }
    
    return null;
  } catch (e) {
    console.error('Error extracting arXiv ID:', e);
    return null;
  }
}

// Function to fetch arXiv title from abstract page
async function fetchArxivTitle(arxivId) {
  try {
    console.log(`Fetching arXiv abstract page for ID: ${arxivId}`);
    const abstractUrl = `https://arxiv.org/abs/${arxivId}`;
    
    const response = await fetch(abstractUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch abstract page: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Parse the HTML to extract the title
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Try various selectors to find the title
    const selectors = [
      '.title',                // Main title class
      'h1.title',              // H1 with title class
      'meta[property="og:title"]', // Open Graph title
      'meta[name="citation_title"]' // Citation title
    ];
    
    let title = null;
    
    // Try each selector
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) {
        if (selector.includes('meta')) {
          // For meta tags, get the content attribute
          title = element.getAttribute('content');
        } else {
          // For regular elements, get the text content
          title = element.textContent;
          // Remove "Title:" prefix if present
          if (title.startsWith('Title:')) {
            title = title.substring(6);
          }
        }
        
        title = title.trim();
        if (title) {
          console.log(`Found title using selector "${selector}": ${title}`);
          break;
        }
      }
    }
    
    // If title not found with selectors, try to extract from page title
    if (!title && doc.title) {
      const titleMatch = doc.title.match(/\[.*?\]\s+(.*)/);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
        console.log(`Extracted title from page title: ${title}`);
      }
    }
    
    return title;
  } catch (error) {
    console.error('Error fetching arXiv title:', error);
    return null;
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === 'EXTRACTED_TITLE') {
      // Store the extracted title with the tab URL as key
      const url = sender.tab.url;
      const title = message.title;
      
      console.log('Received title from content script:', {
        url: url,
        title: title
      });
      
      if (title && typeof title === 'string' && title.trim() !== '') {
        // Extract arXiv ID and store it as a key too
        const arxivId = extractArxivId(url);
        if (arxivId) {
          console.log('Extracted arXiv ID:', arxivId);
          extractedTitles[`arxiv:${arxivId}`] = title;
          extractedTitles[arxivId] = title;
        }
        
        // Store with URL as key
        extractedTitles[url] = title;
        
        // If title starts with "arXiv:" it's probably from a PDF page where we couldn't get the actual title
        if (title.startsWith('arXiv:')) {
          const idFromTitle = title.replace('arXiv:', '').trim();
          console.log('Using arXiv ID from title for later use:', idFromTitle);
          extractedTitles[`pending:${idFromTitle}`] = idFromTitle;
        }
        
        console.log('Stored title in memory. Current titles:', extractedTitles);
        sendResponse({ success: true });
      } else {
        console.warn('Received invalid title, not storing:', title);
        sendResponse({ success: false, error: 'Invalid title' });
      }
    }
  } catch (error) {
    console.error('Error processing message:', error);
    sendResponse({ success: false, error: error.message });
  }
  return true; // Keep the message channel open for async response
});

// Handle PDF downloads
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  console.log('Download intercepted:', downloadItem);
  
  const url = downloadItem.url || '';
  const referrer = downloadItem.referrer || '';
  
  // Only process arXiv downloads
  if (!url.includes('arxiv.org') && !referrer.includes('arxiv.org')) {
    console.log('Not an arXiv download, using original filename');
    suggest({});
    return;
  }
  
  // Check if it's a PDF
  const isPdf = downloadItem.mime === 'application/pdf' || 
                (downloadItem.filename && downloadItem.filename.toLowerCase().endsWith('.pdf'));
  
  if (!isPdf) {
    console.log('Not a PDF, using original filename');
    suggest({});
    return;
  }
  
  console.log('arXiv PDF download detected');
  
  // Try to extract arXiv ID from URLs
  let arxivId = extractArxivId(url);
  if (!arxivId) {
    arxivId = extractArxivId(referrer);
  }
  
  if (!arxivId) {
    console.log('Could not extract arXiv ID, using original filename');
    suggest({});
    return;
  }
  
  console.log('Found arXiv ID for download:', arxivId);
  
  // Check if we already have a title for this ID
  let matchedTitle = extractedTitles[`arxiv:${arxivId}`] || extractedTitles[arxivId];
  
  if (matchedTitle) {
    console.log('Found stored title for arXiv ID:', matchedTitle);
    useArxivTitle(arxivId, matchedTitle, suggest);
    return;
  }
  
  // We don't have the title yet, fetch it from the abstract page
  console.log('No stored title found, fetching from abstract page...');
  
  // Use a temporary filename with the arXiv ID while we fetch the proper title
  suggest({
    filename: `arXiv-${arxivId}.pdf`,
    conflictAction: 'uniquify'
  });
  
  // Fetch the title asynchronously (for next time)
  fetchArxivTitle(arxivId).then(title => {
    if (title) {
      console.log(`Successfully fetched title for ${arxivId}: ${title}`);
      // Store for future use
      extractedTitles[`arxiv:${arxivId}`] = title;
      extractedTitles[arxivId] = title;
    } else {
      console.log(`Could not fetch title for ${arxivId}`);
    }
  }).catch(error => {
    console.error('Error in async title fetching:', error);
  });
});

// Function to use arXiv title for filename
function useArxivTitle(arxivId, title, suggest) {
  // Clean the title
  let cleanTitle = title.replace(/[\\/:*?"<>|]/g, '')  // Remove invalid chars
                       .replace(/\s+/g, ' ')          // Normalize spaces
                       .trim();                       // Trim whitespace
  
  if (cleanTitle && cleanTitle.length > 0) {
    if (cleanTitle.length > 240) {
      cleanTitle = cleanTitle.substring(0, 240);
    }
    
    const newFilename = `${cleanTitle} (${arxivId}).pdf`;
    console.log('Using matched title with arXiv ID for filename:', newFilename);
    
    suggest({
      filename: newFilename,
      conflictAction: 'uniquify'
    });
  } else {
    // If no valid title, use the arXiv ID
    const newFilename = `arXiv-${arxivId}.pdf`;
    console.log('Using arXiv ID as filename:', newFilename);
    
    suggest({
      filename: newFilename,
      conflictAction: 'uniquify'
    });
  }
}

// Log when extension is installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
});