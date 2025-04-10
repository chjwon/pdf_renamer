// arXiv-specific content script
console.log('arXiv Paper PDF Renamer content script loaded');

// Counter to avoid duplicate title submissions
let extractionAttempts = 0;
let lastExtractedTitle = null;

// Run immediately AND when the DOM is fully loaded
extractAndSendTitle();
window.addEventListener('load', extractAndSendTitle);
document.addEventListener('DOMContentLoaded', extractAndSendTitle);

// Make multiple attempts to extract the title with a delay
// ArXiv sometimes loads content dynamically
function extractAndSendTitle() {
  console.log('Attempting to extract title from arXiv page:', window.location.href);
  
  // First attempt immediately
  attemptExtraction();
  
  // Then try again after a short delay (for dynamic content)
  setTimeout(attemptExtraction, 1000);
  
  // And one more time after a longer delay
  setTimeout(attemptExtraction, 3000);
}

function attemptExtraction() {
  extractionAttempts++;
  console.log(`Extraction attempt #${extractionAttempts}`);
  
  try {
    const title = extractArxivTitle();
    
    if (title && title !== lastExtractedTitle) {
      lastExtractedTitle = title;
      console.log('Successfully extracted title:', title);
      
      // Send the title to the background script
      chrome.runtime.sendMessage({
        type: 'EXTRACTED_TITLE',
        title: title,
        url: window.location.href
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError);
          return;
        }
        
        if (response && response.success) {
          console.log('Title successfully sent to background script');
        } else {
          console.log('Failed to send title to background script');
        }
      });
    } else if (!title) {
      console.log('No title could be extracted from this arXiv page on attempt #' + extractionAttempts);
    } else {
      console.log('Title unchanged from previous extraction, not sending again');
    }
  } catch (error) {
    console.error('Error extracting or sending title:', error);
  }
}

function extractArxivTitle() {
  try {
    console.log('Attempting to extract arXiv title');
    
    // Handle direct PDF URL case
    if (window.location.pathname.includes('.pdf')) {
      console.log('Detected PDF URL, trying to extract from URL');
      
      // Extract ID from URL like https://arxiv.org/pdf/1806.07366.pdf
      const pdfMatch = window.location.pathname.match(/\/pdf\/([\d\.v]+)(?:\.pdf)?/);
      if (pdfMatch && pdfMatch[1]) {
        const paperId = pdfMatch[1];
        console.log('Found arXiv paper ID from PDF URL:', paperId);
        
        // We're on the PDF page, so can't extract the title directly
        // Set a placeholder with the ID so the background script can use it
        return `arXiv:${paperId}`;
      }
    }
    
    // Method 1: Title class (most common in arXiv)
    const titleElement = document.querySelector('.title');
    if (titleElement) {
      let title = titleElement.textContent.trim();
      console.log('Found arXiv .title element with text:', title);
      
      // Remove "Title:" prefix if present
      if (title.startsWith('Title:')) {
        title = title.substring(6).trim();
      }
      
      return title;
    }
    
    // Method 2: Extract from meta tags (some arXiv pages have these)
    const metaTags = Array.from(document.querySelectorAll('meta'));
    const metaTitle = metaTags.find(tag => 
      tag.getAttribute('name') === 'citation_title' ||
      tag.getAttribute('property') === 'og:title'
    );
    
    if (metaTitle) {
      const title = metaTitle.getAttribute('content');
      console.log('Found arXiv title in meta tag:', title);
      return title;
    }
    
    // Method 3: Extract from page title
    if (document.title) {
      // arXiv titles are often like "[2304.12345] Some Paper Title"
      const match = document.title.match(/^\[[\d\.v]+\]\s+(.*)/);
      if (match && match[1]) {
        console.log('Extracted title from page title:', match[1]);
        return match[1];
      }
      
      // Sometimes they're formatted differently
      const altMatch = document.title.match(/^arXiv:[\d\.v]+\s+(.*)/);
      if (altMatch && altMatch[1]) {
        console.log('Extracted title from alternative page title format:', altMatch[1]);
        return altMatch[1];
      }
    }
    
    // Method 4: Find the paper ID and look for an element with that ID
    const paperIdMatch = window.location.pathname.match(/\/abs\/([\d\.v]+)/);
    if (paperIdMatch && paperIdMatch[1]) {
      const paperId = paperIdMatch[1];
      console.log('Found arXiv paper ID:', paperId);
      
      // Look for elements with text containing this ID
      const allHeadings = document.querySelectorAll('h1');
      for (const heading of allHeadings) {
        if (heading.textContent.includes(paperId)) {
          // Extract the title part (without the ID)
          const fullText = heading.textContent;
          // Remove the ID part and any surrounding brackets
          const title = fullText.replace(/\[?arXiv:?[0-9\.v]+\]?\s*/, '').trim();
          console.log('Extracted title from heading containing paper ID:', title);
          return title;
        }
      }
    }
    
    // Method 5: Last resort - look for any heading-like element
    const abstractDiv = document.querySelector('#abs, .abstract, .abstext');
    if (abstractDiv) {
      const headingElement = abstractDiv.querySelector('h1, h2, .title, .artTitle');
      if (headingElement) {
        const title = headingElement.textContent.trim();
        console.log('Found title in abstract section:', title);
        return title;
      }
    }
    
    console.log('No arXiv title could be extracted using any method');
    return null;
  } catch (error) {
    console.error('Error in extractArxivTitle:', error);
    return null;
  }
}