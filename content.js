console.log('🚀 Skånetrafiken extension loaded - v2.1.0 (delay fix)');

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
  
  // Only treat journeys as cancelled if they explicitly show "Inställd" text
  // Remarks/annotations ("Den här resan har en anmärkning") can indicate delays, track changes, etc - not just cancellations
  
  return false;
}

// Function to detect if a journey is delayed (not cancelled)
function checkIfJourneyDelayed(journey, journeyText) {
  // Look for patterns indicating delay: 
  // - "Avgick: 14:49" where scheduled was "14:44" 
  // - Time patterns like "14:44 → 14:49" showing actual vs scheduled
  
  // Check if it shows both scheduled and actual times
  const timePattern = /(\d{2}:\d{2})\s*→\s*(\d{2}:\d{2})/;
  const timeMatch = journeyText.match(timePattern);
  
  if (timeMatch) {
    const [, scheduledTime, actualTime] = timeMatch;
    const scheduledMinutes = parseTime(scheduledTime);
    const actualMinutes = parseTime(actualTime);
    const delay = actualMinutes - scheduledMinutes;
    
    // Handle day boundary for late night delays
    const adjustedDelay = delay < -12 * 60 ? delay + 24 * 60 : delay;
    
    console.log(`Found delayed journey: ${scheduledTime} → ${actualTime}, delay: ${adjustedDelay} minutes`);
    return adjustedDelay > 0 ? adjustedDelay : 0;
  }
  
  // Check for "Avgick:" vs scheduled departure patterns
  const avgickMatch = journeyText.match(/Avgick:\s*(\d{2}:\d{2})/);
  if (avgickMatch) {
    // Try to find the scheduled time elsewhere in the text
    const allTimes = journeyText.match(/\b(\d{2}:\d{2})\b/g);
    if (allTimes && allTimes.length >= 2) {
      // First time is usually scheduled, second is actual
      const scheduledTime = allTimes[0];
      const actualTime = avgickMatch[1];
      
      if (scheduledTime !== actualTime) {
        const scheduledMinutes = parseTime(scheduledTime);
        const actualMinutes = parseTime(actualTime);
        const delay = actualMinutes - scheduledMinutes;
        const adjustedDelay = delay < -12 * 60 ? delay + 24 * 60 : delay;
        
        console.log(`Found delayed journey (Avgick): scheduled ${scheduledTime}, actual ${actualTime}, delay: ${adjustedDelay} minutes`);
        return adjustedDelay > 0 ? adjustedDelay : 0;
      }
    }
  }
  
  return 0; // No delay detected
}

// Function to find and process cancelled/delayed rides
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
  
  // Store cancelled/delayed journeys info for processing
  const problematicJourneys = [];
  
  for (let index = 0; index < allJourneys.length; index++) {
    const journey = allJourneys[index];
    // Skip buttons that are not journey items (like "Se tidigare resor", "Sök resa", etc.)
    const journeyText = journey.textContent;
    
    // Debug: Log every journey we're checking
    console.log(`📋 Journey ${index}:`, journeyText.substring(0, 200));
    
    if (!journeyText.includes('Avgick:') && !journeyText.includes('Avgår:') && 
        !journeyText.includes('Har passerat') && !journeyText.includes('Inställd') &&
        !journeyText.includes('Den här resan har en anmärkning')) {
      console.log(`Skipping journey ${index} - not a journey item`);
      continue;
    }
    
    // Skip if button already exists or journey already processed
    if (journey.querySelector('.delay-compensation-btn') || 
        journey.querySelector('.delay-button-container') ||
        journey.hasAttribute('data-delay-processed')) {
      continue;
    }
    
    // Check if this journey is cancelled
    const isCancelled = checkIfJourneyCancelled(journey, journeyText);
    console.log(`🔍 Journey ${index} cancelled: ${isCancelled}`);
    
    // Check if this journey is delayed (but not cancelled)
    let delayMinutes = 0;
    if (!isCancelled) {
      delayMinutes = checkIfJourneyDelayed(journey, journeyText);
      console.log(`⏰ Journey ${index} delay: ${delayMinutes} minutes`);
    }
    
    // DEBUG: Show the decision logic
    const shouldAddButton = isCancelled || delayMinutes >= 20;
    console.log(`🎯 Journey ${index} decision: cancelled=${isCancelled}, delay=${delayMinutes}min, addButton=${shouldAddButton}`);
    
    if (shouldAddButton) {
      console.log(`Found problematic journey ${index}: ${isCancelled ? 'cancelled' : delayMinutes + ' min delayed'}`, journey.textContent.substring(0, 100));
      
      // Skip if this is just a simple "Inställd" text without time info
      if (journeyText.trim() === 'Inställd' || journeyText.length < 20) {
        console.log('Skipping simple cancelled text element');
        continue;
      }
      
      // Mark this journey as being processed to prevent duplicates
      journey.setAttribute('data-delay-processed', 'true');
      
      // Store info about this problematic journey
      problematicJourneys.push({
        index: index,
        journey: journey,
        journeyText: journeyText,
        isCancelled: isCancelled,
        delayMinutes: delayMinutes
      });
    }
  }
  
  // Now process each problematic journey 
  for (const journeyInfo of problematicJourneys) {
    const { index, journey, journeyText, isCancelled, delayMinutes } = journeyInfo;
    
    let finalDelay = 0;
    let departureTime = '';
    
    if (isCancelled) {
      // For cancelled journeys, use the complex calculation with next journey
      
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
      
      departureTime = departureTimeMatch[1];
      
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
      
      // Calculate delay for cancelled journey
      finalDelay = calculateDelay(cancelledArrival, nextTime);
      console.log(`CANCELLED DELAY CALCULATION DEBUG:`);
      console.log(`- Cancelled departure: ${departureTime}`);
      console.log(`- Cancelled expected arrival: ${cancelledArrival}`);
      console.log(`- Next journey time: ${nextTime}`);
      console.log(`- Calculated delay: ${finalDelay} minutes`);
      
    } else {
      // For delayed journeys, we already have the delay and just need the departure time
      finalDelay = delayMinutes;
      
      // Extract the scheduled departure time for delayed journeys
      const timeMatches = journeyText.match(/\b(\d{2}:\d{2})\b/g);
      if (timeMatches && timeMatches.length > 0) {
        departureTime = timeMatches[0]; // First time is usually the scheduled time
      }
      
      console.log(`DELAYED JOURNEY DEBUG:`);
      console.log(`- Scheduled departure: ${departureTime}`);
      console.log(`- Delay: ${finalDelay} minutes`);
    }
    
    // Add button if delay is 20 minutes or more
    if (finalDelay >= 20) {
      // Extract station information and date from journey text
      const journeyInfo = {
        departureTime: departureTime,
        delay: finalDelay,
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

// Function to load credentials from external file
async function loadCredentials() {
  try {
    // SECURITY: Never hardcode credentials! Always load from external file
    const response = await fetch(chrome.runtime.getURL('credentials.json'));
    if (response.ok) {
      const credentials = await response.json();
      window.cachedCredentials = credentials;
      console.log('🔑 Credentials loaded from file:', Object.keys(credentials));
      return credentials;
    } else {
      console.error('❌ credentials.json not found or not accessible');
      alert('credentials.json file is missing! Please add your credentials file to the extension directory.');
      return null;
    }
  } catch (error) {
    console.error('❌ Error loading credentials:', error);
    alert('Failed to load credentials.json. Please check that the file exists and is properly formatted.');
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
                      document.querySelector('input[type="tel"]');
      
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

// Function to auto-fill ersättning application form step 2 (journey search)
function fillErsattningStep2() {
  console.log('🔧 Auto-filling ersättning step 2...');
  
  const journeyInfo = window.cachedJourneyInfo;
  if (!journeyInfo) {
    console.log('⚠️ No cached journey info found for step 2');
    return false;
  }
  
  console.log('📋 Using cached journey info:', journeyInfo);
  
  try {
    // ULTRA-SIMPLIFIED field filling - based on what we know works from manual testing
    const fillField = (element, targetText) => {
      if (!element || !targetText) {
        console.log('❌ Invalid element or text');
        return false;
      }

      console.log(`📝 Attempting to fill field with: "${targetText}"`);
      console.log(`📝 Element:`, element);

      // From manual testing, we know clicking opens a dropdown with options
      console.log('🖱️ Clicking element to open dropdown...');
      element.click();

      // Wait and then look for the dropdown options
      setTimeout(() => {
        const listbox = document.querySelector('listbox');
        console.log('🔍 Looking for listbox after click...');

        if (listbox) {
          console.log('✅ Found listbox!');
          const options = listbox.querySelectorAll('option');
          console.log(`📋 Found ${options.length} options in dropdown`);

          // Log all options to see what's available
          options.forEach((opt, i) => {
            console.log(`  Option[${i}]: "${opt.textContent.trim()}"`);
          });

          // Find and click the best match
          for (const option of options) {
            const optionText = option.textContent.trim();
            const lowerOption = optionText.toLowerCase();
            const lowerTarget = targetText.toLowerCase();

            // Check if this option matches our target
            if (lowerOption.includes(lowerTarget) ||
                lowerTarget.includes(lowerOption) ||
                optionText.includes('Kastrup') && targetText.includes('Kastrup') ||
                optionText.includes('Malmö') && targetText.includes('Malmö') ||
                optionText.includes('Hyllie') && targetText.includes('Hyllie')) {

              console.log(`🎯 MATCH FOUND! Clicking: "${optionText}"`);
              option.click();

              // Verify the selection worked
              setTimeout(() => {
                const currentValue = element.textContent || element.getAttribute('value') || '';
                console.log(`✅ After click, field now contains: "${currentValue}"`);
              }, 100);

              return;
            }
          }
          console.log('❌ No matching option found in dropdown');
        } else {
          console.log('❌ No listbox found after clicking');
        }
      }, 500); // Give dropdown time to appear

      return true;
    };

    // Use the simple fill function
    const fillReactAutocomplete = fillField;

    // Step 1: Set delay duration dropdown
    if (journeyInfo.delay) {
      console.log(`⏱️ Setting delay duration: ${journeyInfo.delay} minutes`);
      const delaySelect = document.querySelector('select') || document.querySelector('[role="combobox"]');
      
      if (delaySelect) {
        // Map delay minutes to the correct option
        let delayOption = '20-39 min'; // default
        if (journeyInfo.delay >= 120) {
          delayOption = 'mer än två timmar';
        } else if (journeyInfo.delay >= 60) {
          delayOption = '60-119 min';
        } else if (journeyInfo.delay >= 40) {
          delayOption = '40-59 min';
        }
        
        console.log(`⏱️ Selecting delay option: ${delayOption}`);
        const options = delaySelect.querySelectorAll('option');
        for (const option of options) {
          if (option.textContent.trim() === delayOption) {
            delaySelect.value = option.value;
            delaySelect.selectedIndex = option.index;
            delaySelect.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      } else {
        console.log('❌ Could not find delay duration dropdown');
      }
    }
    
    // Step 2: Get all comboboxes and other potential field elements
    const allComboboxes = document.querySelectorAll('[role="combobox"]');
    console.log(`🔍 Found ${allComboboxes.length} comboboxes with role="combobox"`);

    // Also check for other potential field types
    const allInputs = document.querySelectorAll('input');
    const allSelects = document.querySelectorAll('select');
    console.log(`🔍 Also found ${allInputs.length} inputs and ${allSelects.length} selects`);

    // Debug: List all comboboxes with their aria-labels and full details
    allComboboxes.forEach((cb, i) => {
      const label = cb.getAttribute('aria-label') || 'no-label';
      const text = cb.textContent || cb.value || '';
      const id = cb.id || 'no-id';
      const className = cb.className || 'no-class';
      console.log(`  Combobox[${i}]: aria="${label}", content="${text}", id="${id}", class="${className}"`);
      console.log(`    HTML:`, cb.outerHTML.substring(0, 200));
    });

    // Debug: Also list inputs that might be the actual form fields
    allInputs.forEach((input, i) => {
      if (input.type !== 'hidden') {
        const label = input.getAttribute('aria-label') || input.getAttribute('placeholder') || 'no-label';
        const name = input.name || 'no-name';
        const id = input.id || 'no-id';
        console.log(`  Input[${i}]: label="${label}", name="${name}", id="${id}", type="${input.type}"`);
      }
    });

    // AGGRESSIVE: Try every possible selector to find form fields
    let fromField = null;
    let toField = null;
    let dateField = null;

    console.log('🔍 AGGRESSIVE field detection starting...');

    // Method 1: Try exact aria-label matching
    fromField = document.querySelector('[aria-label="Från:"]');
    toField = document.querySelector('[aria-label="Till:"]');
    dateField = document.querySelector('[aria-label*="Datum"]') ||
                document.querySelector('[aria-label*="ÅÅÅÅ-MM-DD"]');

    console.log('🎯 Method 1 - Exact aria-label results:');
    console.log(`  - Från: ${fromField ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`  - Till: ${toField ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`  - Date: ${dateField ? 'FOUND' : 'NOT FOUND'}`);

    // Method 2: Try with role="combobox"
    if (!fromField) fromField = document.querySelector('[role="combobox"][aria-label="Från:"]');
    if (!toField) toField = document.querySelector('[role="combobox"][aria-label="Till:"]');
    if (!dateField) dateField = document.querySelector('[role="combobox"][aria-label*="Datum"]');

    console.log('🎯 Method 2 - With combobox role:');
    console.log(`  - Från: ${fromField ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`  - Till: ${toField ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`  - Date: ${dateField ? 'FOUND' : 'NOT FOUND'}`);

    // Method 3: Try finding by position (from our earlier testing, we know the order)
    if (!fromField || !toField) {
      console.log('🎯 Method 3 - Trying positional detection...');

      // We know from testing there are specific comboboxes for From/To
      if (allComboboxes.length >= 3) {
        // Try different positions based on what we've seen
        for (let i = 0; i < allComboboxes.length; i++) {
          const cb = allComboboxes[i];
          const ariaLabel = cb.getAttribute('aria-label') || '';
          const textContent = cb.textContent || '';

          console.log(`  Position[${i}]: aria="${ariaLabel}", text="${textContent.substring(0, 30)}"`);

          // Check if this looks like a From field
          if (!fromField && (ariaLabel.includes('Från') || textContent.includes('Från') ||
                            (i === 1 && ariaLabel.includes(':')))) { // Often second combobox
            fromField = cb;
            console.log(`🎯 FOUND Från at position ${i}`);
          }

          // Check if this looks like a To field
          if (!toField && (ariaLabel.includes('Till') || textContent.includes('Till') ||
                          (i === 2 && ariaLabel.includes(':')))) { // Often third combobox
            toField = cb;
            console.log(`🎯 FOUND Till at position ${i}`);
          }
        }
      }
    }

    // Method 4: Desperate - try ANY element that might work
    if (!fromField || !toField) {
      console.log('🎯 Method 4 - Desperate search...');

      // Try all elements with text "Från:" or "Till:" nearby
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.textContent && el.textContent.includes('Från:') && !fromField) {
          // Look for nearby input-like elements
          const nearby = el.parentElement?.querySelector('input, [role="combobox"], [role="textbox"]');
          if (nearby) {
            fromField = nearby;
            console.log('🎯 FOUND Från via text search');
            break;
          }
        }
        if (el.textContent && el.textContent.includes('Till:') && !toField) {
          const nearby = el.parentElement?.querySelector('input, [role="combobox"], [role="textbox"]');
          if (nearby) {
            toField = nearby;
            console.log('🎯 FOUND Till via text search');
            break;
          }
        }
      }
    }

    // Validate we found the fields correctly
    console.log(`🔍 Field Detection Results:`);
    console.log(`  - Från field: ${fromField ? 'FOUND' : 'NOT FOUND'}`);
    if (fromField) {
      console.log(`    Från details: aria="${fromField.getAttribute('aria-label')}", id="${fromField.id}"`);
      console.log(`    Från HTML:`, fromField.outerHTML.substring(0, 150));
    }
    console.log(`  - Till field: ${toField ? 'FOUND' : 'NOT FOUND'}`);
    if (toField) {
      console.log(`    Till details: aria="${toField.getAttribute('aria-label')}", id="${toField.id}"`);
      console.log(`    Till HTML:`, toField.outerHTML.substring(0, 150));
    }
    console.log(`  - Date field: ${dateField ? 'FOUND' : 'NOT FOUND'}`);
    if (dateField) {
      console.log(`    Date details: aria="${dateField.getAttribute('aria-label')}", id="${dateField.id}"`);
    }

    // Also check journey info
    console.log(`🧪 Journey Info:`);
    console.log(`  - fromStation: "${journeyInfo.fromStation}"`);
    console.log(`  - toStation: "${journeyInfo.toStation}"`);
    console.log(`  - date: "${journeyInfo.date}"`);

    // Simple sequential field filling with longer delays
    console.log('🔄 Starting field filling...');

    // Fill From field first
    if (journeyInfo.fromStation && fromField) {
      console.log(`🚉 FILLING Från field with: "${journeyInfo.fromStation}"`);
      console.log(`🚉 Från field element:`, fromField);
      fillReactAutocomplete(fromField, journeyInfo.fromStation);
    } else {
      console.log(`❌ Cannot fill Från: fromStation="${journeyInfo.fromStation}", fromField=${!!fromField}`);
    }

    // Fill Till field after delay
    setTimeout(() => {
      if (journeyInfo.toStation && toField) {
        console.log(`🎯 FILLING Till field with: "${journeyInfo.toStation}"`);
        console.log(`🎯 Till field element:`, toField);
        fillReactAutocomplete(toField, journeyInfo.toStation);
      } else {
        console.log(`❌ Cannot fill Till: toStation="${journeyInfo.toStation}", toField=${!!toField}`);
      }
    }, 2000);

    // Fill Date field - handle as special case since date pickers work differently
    if (journeyInfo.date && dateField) {
      console.log(`📅 FILLING Date field with: "${journeyInfo.date}"`);
      try {
        // For date fields, try direct value setting first
        console.log('📅 Trying direct date field setting');

        // Check if it has an input element
        const dateInput = dateField.querySelector('input');
        if (dateInput) {
          console.log('📅 Found date input element');
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(dateInput, journeyInfo.date);
          dateInput.dispatchEvent(new Event('input', { bubbles: true }));
          dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          console.log('📅 No input in date field, setting combobox attributes');
          dateField.textContent = journeyInfo.date;
          dateField.setAttribute('value', journeyInfo.date);
          dateField.dispatchEvent(new Event('change', { bubbles: true }));
        }

        console.log(`✅ Successfully filled Date field with "${journeyInfo.date}"`);
      } catch (error) {
        console.log(`❌ Error filling Date field:`, error);
      }
    } else if (journeyInfo.date) {
      console.log(`❌ Cannot fill Date - field not found!`);
    }

    // Step 4: Set departure time
    if (journeyInfo.departureTime) {
      console.log(`🕐 Setting departure time: ${journeyInfo.departureTime}`);
      const [hours, minutes] = journeyInfo.departureTime.split(':');
      
      // Find hour selector
      const hourSelects = document.querySelectorAll('select');
      for (const select of hourSelects) {
        const label = select.previousElementSibling?.textContent || 
                     select.parentElement?.textContent || '';
        
        if (label.toLowerCase().includes('timmar') || label.toLowerCase().includes('hour')) {
          console.log('🕐 Found hour selector:', select);
          const hourOptions = select.querySelectorAll('option');
          for (const option of hourOptions) {
            if (option.value === hours.padStart(2, '0') || option.textContent.trim() === hours.padStart(2, '0')) {
              select.value = option.value;
              select.selectedIndex = option.index;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
          break;
        }
      }
      
      // Find minute selector
      for (const select of hourSelects) {
        const label = select.previousElementSibling?.textContent || 
                     select.parentElement?.textContent || '';
        
        if (label.toLowerCase().includes('minut') || label.toLowerCase().includes('minute')) {
          console.log('🕐 Found minute selector:', select);
          const minuteOptions = select.querySelectorAll('option');
          // Find closest 5-minute interval
          const roundedMinutes = Math.round(parseInt(minutes) / 5) * 5;
          const minuteStr = roundedMinutes.toString().padStart(2, '0');
          
          for (const option of minuteOptions) {
            if (option.value === minuteStr || option.textContent.trim() === minuteStr) {
              select.value = option.value;
              select.selectedIndex = option.index;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
          break;
        }
      }
    }
    
    // Step 5: Click "Sök resa" button - NO DELAY
    const searchBtn = Array.from(document.querySelectorAll('button')).find(btn =>
                       btn.textContent.toLowerCase().includes('sök resa'));

    if (searchBtn) {
      console.log('🔍 Found "Sök resa" button, clicking it');
      searchBtn.click();
    } else {
      console.log('❌ Could not find "Sök resa" button');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error filling ersättning step 2:', error);
    return false;
  }
}

// Run the script when the page loads
function init() {
  console.log('🎯 Extension init() called');
  
  // Check if we're on the ersättning application page
  if (window.location.href.includes('/kundservice/forseningsersattning/ansokan/')) {
    console.log('🎯 Detected ersättning application page');
    
    // Detect which step we're on
    const pageTitle = document.title || '';
    const stepText = document.querySelector('h1')?.textContent || '';
    const isStep1 = pageTitle.includes('steg 1') || stepText.includes('steg 1');
    const isStep2 = pageTitle.includes('steg 2') || stepText.includes('steg 2');
    
    console.log(`🎯 Detected step: ${isStep1 ? 'Step 1' : isStep2 ? 'Step 2' : 'Unknown'}`);
    
    // Add a manual trigger button for testing
    const debugButton = document.createElement('button');
    debugButton.textContent = '🔧 Test Auto-Fill';
    debugButton.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background: #ff6b6b; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;';
    debugButton.onclick = () => {
      console.log('🔧 Manual auto-fill triggered');
      console.log('🔧 Current page URL:', window.location.href);
      console.log('🔧 Page title:', document.title);

      if (isStep1) {
        loadCredentials().then(() => fillErsattningStep1());
      } else if (isStep2) {
        console.log('🔧 Triggering Step 2 auto-fill');
        fillErsattningStep2();
      } else {
        console.log('⚠️ Unknown step, trying step 1');
        loadCredentials().then(() => fillErsattningStep1());
      }
    };
    document.body.appendChild(debugButton);

    // Add a debug info button
    const debugInfoButton = document.createElement('button');
    debugInfoButton.textContent = '🔍 Debug Info';
    debugInfoButton.style.cssText = 'position: fixed; top: 50px; right: 10px; z-index: 9999; background: #4CAF50; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;';
    debugInfoButton.onclick = () => {
      console.log('🔍 === DEBUG INFO ===');
      console.log('Page URL:', window.location.href);
      console.log('Cached journey info:', window.cachedJourneyInfo);
      console.log('All comboboxes:', document.querySelectorAll('[role="combobox"]'));
      console.log('All inputs:', document.querySelectorAll('input'));
      console.log('All selects:', document.querySelectorAll('select'));
      console.log('===================');
    };
    document.body.appendChild(debugInfoButton);
    
    // Auto-fill based on step
    if (isStep1) {
      // Load credentials and try to fill step 1 form
      loadCredentials().then(() => {
        setTimeout(() => fillErsattningStep1(), 500);
        setTimeout(() => fillErsattningStep1(), 1500);
        setTimeout(() => fillErsattningStep1(), 3000);
        
        const formObserver = new MutationObserver(() => {
          setTimeout(() => fillErsattningStep1(), 100);
        });
        
        formObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true
        });
      });
    } else if (isStep2) {
      // ALWAYS set up test journey info for debugging
      console.log('🧪 Setting up test journey info for step 2');
      window.cachedJourneyInfo = {
        departureTime: '14:19',
        delay: 25,
        fromStation: 'Kastrup',
        toStation: 'Malmö Hyllie',
        date: '2025-09-14'
      };
      console.log('🧪 Test journey info set:', window.cachedJourneyInfo);
      
      // Auto-fill step 2 journey search
      setTimeout(() => fillErsattningStep2(), 500);
      setTimeout(() => fillErsattningStep2(), 1500);
      setTimeout(() => fillErsattningStep2(), 3000);
      
      const formObserver = new MutationObserver(() => {
        setTimeout(() => fillErsattningStep2(), 100);
      });
      
      formObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }
    
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