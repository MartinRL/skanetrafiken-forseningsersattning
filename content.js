console.log('🚀 Skånetrafiken extension loaded');

// Function to parse time string (HH:MM format)
function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Function to calculate delay in minutes
function calculateDelay(cancelledArrival, nextArrival) {
  const cancelledMinutes = parseTime(cancelledArrival);
  const nextMinutes = parseTime(nextArrival);
  
  let delay = nextMinutes - cancelledMinutes;
  
  // Only add 24 hours if delay is significantly negative (more than 12 hours)
  // This prevents small negative differences from being treated as next-day
  if (delay < -12 * 60) {
    delay += 24 * 60;
  } else if (delay < 0) {
    // For small negative values, something is wrong - return 0
    console.log(`WARNING: Small negative delay ${delay} min. Setting to 0.`);
    delay = 0;
  }
  
  // Sanity check: delays over 12 hours are probably wrong
  if (delay > 12 * 60) {
    console.log(`WARNING: Unrealistic delay ${delay} min. Might be a calculation error.`);
  }
  
  return delay;
}

// Function to extract time from text
function extractTime(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

// Function to extract from station from journey text
function extractFromStation(text) {
  // Look for patterns like "Från: Kastrup" or extract station names
  const fromMatch = text.match(/Från[:\s]+([^,\n]+)/i);
  if (fromMatch) return fromMatch[1].trim();
  
  // Fallback: look for common patterns in journey text
  const stationMatch = text.match(/(\w+(?:\s+\w+)*)\s*→/);
  if (stationMatch) return stationMatch[1].trim();
  
  return 'Unknown';
}

// Function to extract to station from journey text  
function extractToStation(text) {
  // Look for patterns like "Till: Malmö" or extract destination
  const toMatch = text.match(/Till[:\s]+([^,\n]+)/i);
  if (toMatch) return toMatch[1].trim();
  
  // Fallback: look for arrow pattern
  const stationMatch = text.match(/→\s*(\w+(?:\s+\w+)*)/);
  if (stationMatch) return stationMatch[1].trim();
  
  return 'Unknown';
}

// Function to extract journey date from page context
function extractJourneyDate() {
  // Look for date headers like "Idag, onsdag 3 september 2025" or "Imorgon, torsdag 4 september 2025"
  const dateHeaders = document.querySelectorAll('main');
  if (dateHeaders.length > 0) {
    const mainText = dateHeaders[0].textContent;
    
    // Match patterns like "Idag, onsdag 3 september 2025" or "onsdag 3 september 2025"
    const dateMatch = mainText.match(/(Idag,\s*)?(\w+)\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i);
    if (dateMatch) {
      const [, prefix, dayName, day, month, year] = dateMatch;
      return `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')}`;
    }
  }
  
  // Fallback to today's date
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to convert Swedish month names to numbers
function getMonthNumber(monthName) {
  const months = {
    'januari': '01', 'februari': '02', 'mars': '03', 'april': '04',
    'maj': '05', 'juni': '06', 'juli': '07', 'augusti': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'december': '12'
  };
  return months[monthName.toLowerCase()] || '01';
}

// Function to check if a journey is cancelled by checking for visual indicators
function checkIfJourneyCancelled(journey, journeyText) {
  // First check for explicit "Inställd" in button text
  if (journeyText.includes('Inställd')) {
    console.log('Journey explicitly marked as Inställd');
    return true;
  }
  
  // Check if journey has warning annotation (red triangle) - assume these are cancellations
  // This is a heuristic approach - journeys with red warning triangles are likely cancelled
  if (journeyText.includes('Den här resan har en anmärkning')) {
    console.log('Journey has red warning triangle - assuming cancelled');
    return true;
  }
  
  return false;
}

// Function to find and process cancelled rides
function processCancelledRides() {
  // Find all journey containers - try multiple selectors to find journey elements
  let allJourneys = document.querySelectorAll('main button');
  
  // If no journeys found with main button, try alternative selectors
  if (allJourneys.length === 0) {
    console.log('No journeys found with "main button", trying alternative selectors...');
    allJourneys = document.querySelectorAll('button[class*="journey"]');
  }
  
  if (allJourneys.length === 0) {
    allJourneys = document.querySelectorAll('[class*="journey"]');
  }
  
  if (allJourneys.length === 0) {
    allJourneys = document.querySelectorAll('button');
    console.log('Fallback: found', allJourneys.length, 'buttons total');
  }
  
  console.log(`Processing ${allJourneys.length} journeys`);
  
  // Store cancelled journeys info for processing
  const cancelledJourneys = [];
  
  for (let index = 0; index < allJourneys.length; index++) {
    const journey = allJourneys[index];
    // Skip buttons that are not journey items (like "Se tidigare resor", "Sök resa", etc.)
    const journeyText = journey.textContent;
    
    // Debug: Log every journey we're checking
    console.log(`Journey ${index}:`, journeyText.substring(0, 150));
    
    if (!journeyText.includes('Avgick:') && !journeyText.includes('Avgår:') && 
        !journeyText.includes('Har passerat') && !journeyText.includes('Inställd') &&
        !journeyText.includes('Den här resan har en anmärkning')) {
      console.log(`Skipping journey ${index} - not a journey item`);
      continue;
    }
    
    // Check if this journey is cancelled
    const isCancelled = checkIfJourneyCancelled(journey, journeyText);
    console.log(`Journey ${index} cancelled: ${isCancelled}`);
    
    if (isCancelled) {
      console.log(`Found cancelled journey ${index}:`, journey.textContent.substring(0, 100));
      
      // Skip if this is just a simple "Inställd" text without time info
      if (journeyText.trim() === 'Inställd' || journeyText.length < 20) {
        console.log('Skipping simple cancelled text element');
        continue;
      }
      
      // Skip if button already exists or journey already processed
      if (journey.querySelector('.delay-compensation-btn') || 
          journey.querySelector('.delay-button-container') ||
          journey.hasAttribute('data-delay-processed')) {
        continue;
      }
      
      // Mark this journey as being processed to prevent duplicates
      journey.setAttribute('data-delay-processed', 'true');
      
      // Store info about this cancelled journey
      cancelledJourneys.push({
        index: index,
        journey: journey,
        journeyText: journeyText
      });
    }
  }
  
  // Now process each cancelled journey to find delays
  for (const cancelledInfo of cancelledJourneys) {
    const { index, journey, journeyText } = cancelledInfo;
    
    // Extract cancelled departure time and calculate arrival
    // Look for departure time first (handle both "Avgår:" and "Avgick:")
    let departureTimeMatch = journeyText.match(/Avg(?:år|ick):\s*(\d{2}:\d{2})/);
    
    // For cancelled journeys, look for the pattern after "--:--" 
    if (!departureTimeMatch) {
      departureTimeMatch = journeyText.match(/--:--(\d{2}:\d{2})/);
    }
    
    // Also check for standalone time pattern (like "13:14") - get the first valid time
    if (!departureTimeMatch) {
      const timeMatches = journeyText.match(/\b(\d{2}:\d{2})\b/g);
      if (timeMatches && timeMatches.length > 0) {
        // Find the first time that's not "--:--" 
        for (const timeMatch of timeMatches) {
          if (timeMatch !== '--:--') {
            departureTimeMatch = [null, timeMatch];
            break;
          }
        }
      }
    }
    
    if (!departureTimeMatch) {
      console.log('Could not find departure time for cancelled journey:', journeyText.substring(0, 200));
      console.log('Full journey text:', journeyText);
      const allTimes = journeyText.match(/\d{2}:\d{2}/g);
      console.log('All times found in text:', allTimes);
      continue;
    }
    
    const departureTime = departureTimeMatch[1];
    
    // Calculate arrival time as departure + 13 minutes
    const [hours, minutes] = departureTime.split(':').map(Number);
    const departureMinutes = hours * 60 + minutes;
    const arrivalMinutes = departureMinutes + 13;
    
    // Handle day boundary
    const arrivalHours = Math.floor((arrivalMinutes % (24 * 60)) / 60);
    const arrivalMins = arrivalMinutes % 60;
    const cancelledArrival = `${arrivalHours.toString().padStart(2, '0')}:${arrivalMins.toString().padStart(2, '0')}`;
    
    // Find the next non-cancelled journey
    let nextJourney = null;
    let nextTime = null;
    
    for (let i = index + 1; i < allJourneys.length; i++) {
      const nextJourneyCandidate = allJourneys[i];
      const nextJourneyText = nextJourneyCandidate.textContent;
      
      // Skip buttons that are not journey items
      if (!nextJourneyText.includes('Avgick:') && !nextJourneyText.includes('Avgår:') && 
          !nextJourneyText.includes('Har passerat') && !nextJourneyText.includes('Inställd')) {
        continue;
      }
      
      // Check if this next journey is also cancelled
      const isNextCancelled = checkIfJourneyCancelled(nextJourneyCandidate, nextJourneyText);
      
      if (!isNextCancelled) {
        console.log(`Checking next journey candidate: ${nextJourneyText.substring(0, 100)}`);
        // For delay calculation, we want the ARRIVAL time of next journey
        // Look specifically for arrival time first, then departure as fallback
        let nextTimeMatch = nextJourneyText.match(/Ankom(?:mer)?:\s*(\d{2}:\d{2})/);
        if (!nextTimeMatch) {
          // If no arrival time, look for departure and calculate arrival (+13 min)
          const depMatch = nextJourneyText.match(/Avg(?:år|ick):\s*(\d{2}:\d{2})/);
          if (depMatch) {
            const depTime = depMatch[1];
            const [hours, minutes] = depTime.split(':').map(Number);
            const depMinutes = hours * 60 + minutes;
            const arrMinutes = depMinutes + 13; // Add 13 minutes travel time
            const arrHours = Math.floor((arrMinutes % (24 * 60)) / 60);
            const arrMins = arrMinutes % 60;
            const calculatedArrival = `${arrHours.toString().padStart(2, '0')}:${arrMins.toString().padStart(2, '0')}`;
            nextTimeMatch = [null, calculatedArrival];
            console.log(`Calculated next arrival from departure ${depTime} -> ${calculatedArrival}`);
          }
        }
        
        if (nextTimeMatch) {
          console.log(`Found next journey time: ${nextTimeMatch[1]} from text: ${nextJourneyText.substring(0, 100)}`);
          nextJourney = nextJourneyCandidate;
          nextTime = nextTimeMatch[1];
          break;
        }
      }
    }
    
    if (!nextTime) {
      console.log('No next non-cancelled journey found with valid time');
      continue;
    }
    
    // Calculate delay
    const delay = calculateDelay(cancelledArrival, nextTime);
    console.log(`DELAY CALCULATION DEBUG:`);
    console.log(`- Cancelled departure: ${departureTime}`);
    console.log(`- Cancelled expected arrival: ${cancelledArrival}`);
    console.log(`- Next journey time: ${nextTime}`);
    console.log(`- Calculated delay: ${delay} minutes`);
    console.log(`- Cancelled arrival minutes: ${parseTime(cancelledArrival)}`);
    console.log(`- Next time minutes: ${parseTime(nextTime)}`);
    console.log(`- Raw difference: ${parseTime(nextTime) - parseTime(cancelledArrival)} minutes`);
    
    // Add button if delay is 20 minutes or more
    if (delay >= 20) {
      // Extract station information and date from journey text
      const journeyInfo = {
        departureTime: departureTime,
        delay: delay,
        fromStation: extractFromStation(journeyText),
        toStation: extractToStation(journeyText),
        date: extractJourneyDate()
      };
      
      addDelayButton(journey, journeyInfo);
    }
  }
}

// Function to add delay compensation button
function addDelayButton(journeyElement, journeyInfo) {
  const button = document.createElement('button');
  button.className = 'delay-compensation-btn';
  button.textContent = `Ersättning (${journeyInfo.delay} min försening)`;
  button.title = `Klicka för att ansöka om ersättning för ${journeyInfo.delay} minuters försening`;
  
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Cache journey information for ersättning flow
    console.log('Caching journey info:', journeyInfo);
    window.cachedJourneyInfo = journeyInfo;
    
    // Navigate to ersättning application page
    navigateToErsattningPage();
  });
  
  // Find a good place to insert the button
  // Try to add it to the journey container
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'delay-button-container';
  buttonContainer.appendChild(button);
  
  // Insert at the end of the journey element
  journeyElement.appendChild(buttonContainer);
}

// Function to load credentials from extension storage
async function loadCredentials() {
  try {
    // In a real extension, credentials would be loaded securely
    // For now, we'll use the cached credentials from our credentials.json
    const credentials = {
      'email': 'martinrosenlidholm@gmail.com',
      'ticket-id': 'E4H825D',
      'phone-number': '0707318625',
      'person-number': 'REDACTED'
    };
    window.cachedCredentials = credentials;
    console.log('🔑 Credentials loaded:', Object.keys(credentials));
    return credentials;
  } catch (error) {
    console.error('❌ Error loading credentials:', error);
    return null;
  }
}

// Function to navigate to ersättning application page
function navigateToErsattningPage() {
  console.log('Navigating to ersättning application page...');
  console.log('Cached journey info:', window.cachedJourneyInfo);
  
  // Load credentials for form filling
  loadCredentials();
  
  // Navigate directly to the ersättning application page
  const ersattningUrl = 'https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan/';
  console.log('Opening:', ersattningUrl);
  window.location.href = ersattningUrl;
}

// Function to auto-fill ersättning application form step 1
function fillErsattningStep1() {
  console.log('🔧 Auto-filling ersättning step 1...');
  
  const journeyInfo = window.cachedJourneyInfo;
  if (journeyInfo) {
    console.log('📋 Using cached journey info:', journeyInfo);
  } else {
    console.log('⚠️ No cached journey info found, will still try to fill basic fields');
  }
  
  try {
    // Step 1: Set the correct date in the dropdown (try multiple selectors)
    const dateSelect = document.querySelector('select[name="TravelDateStep1"]') ||
                      document.querySelector('select') ||
                      document.querySelector('combobox');
    
    if (dateSelect) {
      if (journeyInfo && journeyInfo.date) {
        console.log(`📅 Setting date to: ${journeyInfo.date}`);
        dateSelect.value = journeyInfo.date;
        dateSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        console.log('📅 Date selector found but no journey date available, keeping current selection');
      }
    } else {
      console.log('❌ Could not find date selector');
    }
    
    // Step 2: Click "Appbiljett Skånetrafiken" checkbox
    console.log('🔍 Looking for Appbiljett Skånetrafiken checkbox...');
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    console.log(`Found ${checkboxes.length} checkboxes on page`);
    
    let appBiljettCheckbox = null;
    
    // Look through all checkboxes to find the Appbiljett one
    for (const checkbox of checkboxes) {
      // Check text content around the checkbox
      const parent = checkbox.parentElement;
      const nextText = checkbox.nextSibling?.textContent?.trim() || '';
      const parentText = parent?.textContent?.trim() || '';
      
      console.log(`Checkbox text: "${nextText}" or parent: "${parentText}"`);
      
      if (nextText.toLowerCase().includes('appbiljett') || 
          parentText.toLowerCase().includes('appbiljett')) {
        appBiljettCheckbox = checkbox;
        console.log('✅ Found Appbiljett checkbox!');
        break;
      }
    }
    
    if (appBiljettCheckbox) {
      console.log('📱 Selecting Appbiljett Skånetrafiken checkbox');
      if (!appBiljettCheckbox.checked) {
        appBiljettCheckbox.click();
        console.log('✅ Checkbox clicked');
      } else {
        console.log('✅ Checkbox already checked');
      }
    } else {
      console.log('❌ Could not find Appbiljett Skånetrafiken checkbox');
    }
    
    // Wait a moment for any dynamic content to load after selecting ticket type
    setTimeout(() => {
      // Step 3: Fill in phone number (try multiple selectors)
      let phoneInput = document.querySelector('input[name*="Mobilnummer"]') || 
                      document.querySelector('input[id*="phone"]') || 
                      document.querySelector('input[placeholder*="mobil"]') ||
                      document.querySelector('input[type="tel"]') ||
                      document.querySelector('label:contains("Mobilnummer") + input, label:contains("Mobilnummer") ~ input');
      
      // If still not found, try finding by proximity to "Mobilnummer" text
      if (!phoneInput) {
        const labels = document.querySelectorAll('label, span, div');
        for (const label of labels) {
          if (label.textContent.toLowerCase().includes('mobilnummer')) {
            phoneInput = label.nextElementSibling?.querySelector('input') || 
                        label.parentElement?.querySelector('input') ||
                        label.closest('div')?.querySelector('input[type="text"], input[type="tel"]');
            if (phoneInput) break;
          }
        }
      }
      
      if (phoneInput && window.cachedCredentials && window.cachedCredentials['phone-number']) {
        console.log('📞 Filling phone number in field:', phoneInput);
        phoneInput.value = window.cachedCredentials['phone-number'];
        phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        console.log('❌ Could not find phone input field');
      }
      
      // Step 4: Fill in ticket ID (try multiple selectors)
      // First try to find the visible textbox specifically (not hidden inputs)
      let ticketIdInput = null;
      
      // Look for textboxes near "BiljettID" text that are visible
      const allTextInputs = document.querySelectorAll('input[type="text"], input:not([type])');
      console.log(`🔍 Found ${allTextInputs.length} text inputs on page`);
      
      for (const input of allTextInputs) {
        // Skip hidden inputs
        if (input.type === 'hidden' || input.style.display === 'none' || input.offsetParent === null) {
          continue;
        }
        
        // Check if input is near "BiljettID" text
        const parent = input.parentElement;
        const grandParent = parent?.parentElement;
        const previousSibling = input.previousElementSibling;
        
        // Check various elements around the input for "BiljettID" text
        const textSources = [
          parent?.textContent || '',
          grandParent?.textContent || '',
          previousSibling?.textContent || '',
          input.placeholder || '',
          input.name || '',
          input.id || ''
        ];
        
        for (const text of textSources) {
          if (text.toLowerCase().includes('biljettid') || text.toLowerCase().includes('biljettnummer')) {
            console.log(`🎫 Found BiljettID input near text: "${text.substring(0, 50)}" - Input: ${input.outerHTML.substring(0, 100)}`);
            ticketIdInput = input;
            break;
          }
        }
        
        if (ticketIdInput) break;
      }
      
      // Fallback to original selectors if proximity search didn't work
      if (!ticketIdInput) {
        ticketIdInput = document.querySelector('input[name*="BiljettID"]') ||
                       document.querySelector('input[name*="biljettid"]') ||
                       document.querySelector('input[placeholder*="biljett"]');
      }
      
      if (ticketIdInput && window.cachedCredentials && window.cachedCredentials['ticket-id']) {
        console.log('🎫 Filling ticket ID in field:', ticketIdInput);
        ticketIdInput.value = window.cachedCredentials['ticket-id'];
        ticketIdInput.dispatchEvent(new Event('input', { bubbles: true }));
        ticketIdInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        console.log('❌ Could not find ticket ID input field');
      }
      
      // Step 5: Click continue button
      setTimeout(() => {
        const continueBtn = document.querySelector('button.continue, button[class*="continue"]');
        if (continueBtn) {
          console.log('➡️ Clicking continue to step 2');
          continueBtn.click();
        }
      }, 500);
      
    }, 1000);
    
    return true;
  } catch (error) {
    console.error('❌ Error filling ersättning form:', error);
    return false;
  }
}

// Run the script when the page loads
function init() {
  console.log('🎯 Extension init() called');
  
  // Check if we're on the ersättning application page
  if (window.location.href.includes('/kundservice/forseningsersattning/ansokan/')) {
    console.log('🎯 Detected ersättning application page');
    
    // Add a manual trigger button for testing
    const debugButton = document.createElement('button');
    debugButton.textContent = '🔧 Test Auto-Fill';
    debugButton.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background: #ff6b6b; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;';
    debugButton.onclick = () => {
      console.log('🔧 Manual auto-fill triggered');
      loadCredentials().then(() => fillErsattningStep1());
    };
    document.body.appendChild(debugButton);
    
    // Load credentials and try to fill the form multiple times to ensure it works
    loadCredentials().then(() => {
      // Try multiple times with different delays
      setTimeout(() => fillErsattningStep1(), 500);
      setTimeout(() => fillErsattningStep1(), 1500);
      setTimeout(() => fillErsattningStep1(), 3000);
      
      // Also set up a MutationObserver to try again when DOM changes
      const formObserver = new MutationObserver(() => {
        setTimeout(() => fillErsattningStep1(), 100);
      });
      
      formObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
    });
    return; // Don't process cancelled rides on this page
  }
  
  // Process rides immediately on journey search pages
  processCancelledRides();
  
  // Set up a MutationObserver to handle dynamic content
  const observer = new MutationObserver((mutations) => {
    let shouldProcess = false;
    
    mutations.forEach(mutation => {
      // Check for added nodes with journey elements
      if (mutation.addedNodes.length > 0) {
        const hasJourneyNodes = Array.from(mutation.addedNodes).some(node => {
          return node.nodeType === 1 && (
            node.matches?.('[class*="st-journey"]') ||
            node.querySelector?.('[class*="st-journey"]')
          );
        });
        if (hasJourneyNodes) shouldProcess = true;
      }
      
      // Check for attribute changes on journey elements
      if (mutation.type === 'attributes' && 
          mutation.target.matches?.('[class*="st-journey"]')) {
        shouldProcess = true;
      }
      
      // Check for text content changes that might affect journey detection
      if (mutation.type === 'characterData' || 
          (mutation.type === 'childList' && mutation.target.matches?.('[class*="st-journey"]'))) {
        shouldProcess = true;
      }
    });
    
    if (shouldProcess) {
      // Add a small delay to ensure DOM is fully updated
      setTimeout(processCancelledRides, 100);
    }
  });
  
  // Start observing the document body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
    attributeFilter: ['class'] // Only watch class changes
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}