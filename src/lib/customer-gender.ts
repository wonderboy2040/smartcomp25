/**
 * Customer gender inference → respectful WhatsApp greeting (v13.7)
 *
 * The user asked: "customer ko respect use karo — male customer ko Sir,
 * female customer ko Madam — jab WhatsApp se invoice, quotation ya service
 * job share karte ho."
 *
 * Source-of-truth priority:
 *   1. Explicit `gender` field on the customer record ('male' | 'female')
 *      (added to the Customers sheet + dialog in v13.7)
 *   2. Name prefix (Mr., Shri, Mrs., Smt., Kumari, Mohd. …)
 *   3. Common Indian first-name dictionary (~350 entries)
 *   4. Name suffix hints (-kumar, -prasad, -bhai → male; -ben, -didi → female)
 *   5. Business-name detection (Traders, Computers, Enterprises …) → neutral
 *
 * When nothing matches we return a neutral "Dear <FirstName>," — guessing the
 * wrong honorific is worse than a neutral greeting.
 */

export type Honorific = 'Sir' | 'Madam' | null

const MALE_PREFIXES = new Set([
  'mr', 'mr.', 'shri', 'sri', 'sardar', 'master', 'mohd', 'mohd.',
  'muhammad', 'mohammed', 'md', 'md.', 'syed', 'maulana', 'pandit', 'haji',
])

const FEMALE_PREFIXES = new Set([
  'mrs', 'mrs.', 'miss', 'ms', 'ms.', 'shrimati', 'smt', 'smt.',
  'kumari', 'begum', 'w/o', 'd/o',
])

const MALE_SUFFIXES = ['kumar', 'prasad', 'bhai', 'kaka', 'nath', 'chand', 'veer', 'lal', 'singh']

const FEMALE_SUFFIXES = ['ben', 'didi', 'bai', 'devi', 'amma', 'begum', 'kaur']

const BUSINESS_WORDS = [
  'traders', 'trading', 'enterprises', 'enterprise', 'computers', 'computer',
  'systems', 'solutions', 'services', 'service', 'store', 'stores', 'shop',
  'agency', 'technologies', 'tech', 'electronics', 'infotech', 'sales',
  'corporation', 'corp', 'pvt', 'private', 'limited', 'ltd', 'hardware',
  'mobiles', 'stationers', 'xerox', 'cyber', 'studio', 'works', 'engineering',
  'laptop', 'repair', 'suppliers', 'distributors', 'agencies',
  'communications', 'media', 'hospital', 'clinic', 'pharmacy', 'medical',
  'school', 'college', 'academy', 'classes', 'associates', 'ventures',
  'mart', 'bazaar', 'emporium', 'centre', 'center', 'point', 'world',
]

// Common Indian male first names (lowercase) — the names a small-town
// computer shop actually sees on invoices and service jobs.
const MALE_NAMES = new Set([
  'ramesh', 'suresh', 'mahesh', 'ganesh', 'dinesh', 'naresh', 'rajesh', 'mukesh',
  'hitesh', 'nilesh', 'bhavesh', 'jignesh', 'chirag', 'mayur', 'hardik', 'hiren',
  'sagar', 'nirav', 'parag', 'nikhil', 'ashish', 'abhishek', 'akhilesh', 'ram',
  'shyam', 'mohan', 'sohan', 'rohan', 'gopal', 'govind', 'hari', 'harish',
  'manohar', 'manoj', 'sanjay', 'vijay', 'ajay', 'akash', 'prakash', 'dipak',
  'deepak', 'kapil', 'sunil', 'anil', 'rahul', 'amit', 'sumit', 'arun', 'varun',
  'tarun', 'karan', 'vikas', 'vikram', 'vinod', 'vivek', 'ashok', 'satish',
  'santosh', 'ravindra', 'mahendra', 'bhupendra', 'devendra', 'surendra',
  'jitendra', 'yogesh', 'prasad', 'narayan', 'narayana', 'krishna', 'kishan',
  'kishore', 'murari', 'madhav', 'balram', 'girdhari', 'shravan', 'chandan',
  'arjun', 'nakul', 'sahadev', 'bheem', 'karna', 'abhimanyu', 'parth', 'uday',
  'umesh', 'upendra', 'yash', 'yashwant', 'yogendra', 'vishal', 'saurabh',
  'gaurav', 'manav', 'manish', 'mohit', 'rohit', 'nitin', 'atul', 'abhay',
  'ajit', 'amol', 'aniket', 'ankit', 'asad', 'aslam', 'ayaz', 'bashir',
  'faizan', 'farhan', 'furqan', 'imran', 'irfan', 'javed', 'kaleem', 'kamran',
  'layak', 'majid', 'masood', 'mehtab', 'nadeem', 'nasir', 'nawaz', 'qasim',
  'rafiq', 'saif', 'salim', 'sameer', 'shahid', 'shakeel', 'shoaib', 'sohail',
  'suhail', 'tabrez', 'taufiq', 'tufail', 'usman', 'waqar', 'wasim', 'yaqub',
  'yusuf', 'zafar', 'zahid', 'zakir', 'ali', 'hasan', 'hussain', 'abbas',
  'akbar', 'amir', 'asghar', 'asif', 'atif', 'azhar', 'azim', 'bilal', 'danish',
  'ehsan', 'fahad', 'faisal', 'farrukh', 'ghulam', 'hammad', 'hashim',
  'humayun', 'hyder', 'ijaz', 'inam', 'irshad', 'jahangir', 'jalal', 'jamal',
  'junaid', 'kashif', 'khurshid', 'khwaja', 'maqsood', 'mubashir', 'mudasir',
  'mudassar', 'mustafa', 'muzaffar', 'naveed', 'nazim', 'numan', 'owais',
  'qaiser', 'rashid', 'rehan', 'rizwan', 'saad', 'sajid', 'salman', 'sarfaraz',
  'shabir', 'shehzad', 'siddiq', 'sikandar', 'sultan', 'tanveer', 'umar',
  'wahid', 'wajid', 'yasin', 'zaman', 'zubair', 'aditya', 'agastya', 'ananth',
  'aravind', 'arindam', 'arnav', 'aryan', 'atharv', 'ayush', 'badri', 'bharat',
  'bhargav', 'bhavik', 'brijesh', 'chaitanya', 'chetan', 'daksh', 'darshan',
  'devansh', 'devraj', 'dhanraj', 'dhruv', 'divyansh', 'ekansh', 'gajendra',
  'gaurang', 'harsh', 'harshad', 'harshit', 'hemant', 'het', 'himanshu',
  'hrishikesh', 'indra', 'ishan', 'ivaan', 'jatin', 'jay', 'kalpesh', 'kannan',
  'kartik', 'kaustubh', 'keshav', 'kuldip', 'kunal', 'lakshya', 'laxman',
  'madhur', 'malhar', 'mayank', 'meet', 'mihir', 'mitul', 'nandan', 'naveen',
  'navneet', 'niraj', 'nischay', 'nishant', 'om', 'omkar', 'parthiv', 'pavan',
  'pranav', 'prateek', 'pratik', 'prem', 'pulkit', 'purvesh', 'raj', 'rajan',
  'rajat', 'rajeev', 'rajiv', 'rakshit', 'ranjeet', 'ravi', 'reetesh', 'rihan',
  'riyan', 'roshan', 'rushi', 'rutesh', 'sachin', 'sahil', 'samir', 'sanket',
  'sarthak', 'shaan', 'shakti', 'sharang', 'shashank', 'shauraya', 'shiva',
  'shivan', 'shlok', 'shrey', 'shreyas', 'siddharth', 'siddhesh', 'somnath',
  'sudarshan', 'sudhir', 'sumedh', 'sumeet', 'surya', 'swapnil', 'tanmay',
  'tejas', 'tushar', 'udit', 'ujjwal', 'utsav', 'vaibhav', 'vansh', 'vedant',
  'veer', 'vidur', 'vijayant', 'vineet', 'vinit', 'viraj', 'vivaan', 'yuvan',
])

// Common Indian female first names (lowercase).
const FEMALE_NAMES = new Set([
  'priya', 'priyanka', 'priti', 'preeti', 'preety', 'pooja', 'puja', 'payal',
  'palak', 'parul', 'pallavi', 'pankhuri', 'pragya', 'prerna', 'prajakta',
  'purvi', 'padma', 'geeta', 'gita', 'sita', 'radha', 'riddhi', 'ritu', 'rupa',
  'rupali', 'rekha', 'reshma', 'renu', 'rasika', 'roshni', 'reena', 'ruchi',
  'ruchira', 'ritika', 'riya', 'ruhi', 'ruksana', 'ruksar', 'sabana', 'sadhana',
  'sagarika', 'saira', 'sajida', 'salma', 'sameena', 'samreen', 'sana',
  'sandhya', 'sangita', 'saniya', 'sara', 'sarah', 'sarita', 'savita', 'seema',
  'shabana', 'shagufta', 'shalini', 'shama', 'sharmila', 'shaista', 'sheetal',
  'shikha', 'shilpa', 'shreya', 'shruti', 'shweta', 'simran', 'sneha',
  'snehal', 'sonal', 'sonam', 'sonia', 'sunita', 'supriya', 'sushma', 'swapna',
  'swati', 'sweety', 'sweta', 'tamanna', 'tanvi', 'tanuja', 'tara', 'teena',
  'tina', 'toshi', 'trupti', 'twinkle', 'ujwala', 'uma', 'urvi', 'usha',
  'vaishali', 'vanita', 'varsha', 'vasanti', 'veena', 'vidya', 'vijaya',
  'vimala', 'vineeta', 'yamini', 'yasmin', 'yogita', 'zainab', 'zeba', 'zoya',
  'afreen', 'aisha', 'aaysha', 'aalia', 'aamna', 'aanchal', 'aarti', 'arti',
  'aarzoo', 'abha', 'aditi', 'ahana', 'akanksha', 'akshata', 'aliya', 'alisha',
  'amrita', 'amrin', 'anita', 'anjali', 'ankita', 'anshu', 'antara',
  'anuradha', 'aparna', 'archana', 'arpana', 'ashwini', 'asmita', 'ayesha',
  'beena', 'bhagyashree', 'bhavana', 'bhawna', 'bindiya', 'chanda', 'chhaya',
  'chhavi', 'chitra', 'damini', 'darshana', 'deepa', 'deepika', 'deeksha',
  'devika', 'dimple', 'divya', 'diya', 'ekta', 'falguni', 'farah', 'farida',
  'fatima', 'gauri', 'gayatri', 'ghazala', 'gunjan', 'hema', 'henna', 'heena',
  'hina', 'hiral', 'indira', 'ishita', 'jagruti', 'jamila', 'jasmin', 'jaya',
  'jyoti', 'kajal', 'kanchan', 'kavita', 'keerti', 'khushboo', 'khushi',
  'komal', 'kripa', 'kriti', 'kumkum', 'kunjal', 'laxmi', 'lakshmi', 'leena',
  'madhavi', 'madhuri', 'mahima', 'mamta', 'manisha', 'manju', 'meena',
  'meenakshi', 'megha', 'mehak', 'mira', 'meera', 'minal', 'mona', 'mousami',
  'mrunalini', 'nagma', 'namrata', 'nasreen', 'naziya', 'neelam', 'neha',
  'nida', 'niharika', 'nikita', 'nisha', 'nishtha', 'nita', 'nithya', 'nitya',
  'nupur', 'nusrat', 'nyra', 'prachi', 'pratibha', 'pratima', 'navya',
  'navami', 'nandini', 'naincy', 'muskan', 'manshi', 'mansi', 'meenakshi',
])

/**
 * Infer Sir/Madam for a customer.
 *
 * @param rawName customer display name (any format: "Ramesh Kumar",
 *                "Mrs. Sharma", "Priya Traders", walk-in, etc.)
 * @param gender  explicit gender from the customer record, if known
 * @returns 'Sir' | 'Madam' | null (null = neutral greeting)
 */
export function inferHonorific(rawName: string | undefined | null, gender?: string | null): Honorific {
  // 1. Explicit field wins
  const g = String(gender || '').trim().toLowerCase()
  if (g === 'male' || g === 'm' || g === 'man' || g === 'boy') return 'Sir'
  if (g === 'female' || g === 'f' || g === 'woman' || g === 'girl' || g === 'lady') return 'Madam'
  if (g === 'other' || g === 'unknown') return null

  const name = String(rawName || '').trim()
  if (!name) return null

  const lower = name.toLowerCase()

  // Walk-in / anonymous → neutral
  if (/^(walk[- ]?in|customer|guest|anonymous|unknown|cash)/.test(lower)) return null

  // 2. Business name → neutral FIRST (before prefix/dictionary — "Shri
  // Enterprises" is a firm, not a man; a name containing a business word is
  // nearly always a proprietorship, not a person).
  for (const w of BUSINESS_WORDS) {
    if (lower.includes(w)) return null
  }

  // 3. Prefix scan (leading honorific words only)
  const tokens = lower.replace(/[^a-z\s./]/g, ' ').split(/\s+/).filter(Boolean)
  for (let i = 0; i < Math.min(3, tokens.length); i++) {
    const t = tokens[i]
    if (FEMALE_PREFIXES.has(t)) return 'Madam'
    if (MALE_PREFIXES.has(t)) return 'Sir'
    // 'w/o' / 'd/o' style prefixes contain '/' — handled above after cleanup.
    // Stop once we reach the actual name (a non-honorific token).
    break
  }

  // 4. First-name dictionary
  const first = tokens[0] || ''
  if (first && FEMALE_NAMES.has(first)) return 'Madam'
  if (first && MALE_NAMES.has(first)) return 'Sir'

  // 5. Suffix hints — on ANY token (Gujarati style puts the honorific on the
  // first name: "Kinjalben Patel", "Bhaveshbhai Shah") or at the end of the
  // full name ("Devendra Singh", "Harpreet Kaur").
  for (const t of tokens) {
    for (const s of FEMALE_SUFFIXES) if (t.endsWith(s) || t === s) return 'Madam'
    for (const s of MALE_SUFFIXES) if (t.endsWith(s) || t === s) return 'Sir'
  }
  for (const s of FEMALE_SUFFIXES) if (lower.endsWith(s)) return 'Madam'
  for (const s of MALE_SUFFIXES) if (lower.endsWith(s)) return 'Sir'

  return null
}

/**
 * Build the respectful greeting line used in WhatsApp share messages.
 *
 *   "Respected Sir,"   (male)
 *   "Respected Madam," (female)
 *   "Dear Ramesh,"     (neutral, uses first name)
 *   "Dear Customer,"   (neutral, no usable name)
 */
export function respectfulGreeting(rawName: string | undefined | null, gender?: string | null): string {
  const honorific = inferHonorific(rawName, gender)
  if (honorific) return `Respected ${honorific},`
  const name = String(rawName || '').trim()
  if (!name || /^walk[- ]?in/i.test(name)) return 'Dear Customer,'
  const firstName = name.split(/\s+/)[0]
  return `Dear ${firstName},`
}
