
// Inject shared styles first
const sharedStyles = document.createElement('style');
sharedStyles.textContent = `
/* Core Styles */
* { scroll-behavior: smooth; box-sizing: border-box; }
body { font-family: 'DM Sans', sans-serif; background-color: #F5F7FA; color: #1A202C; line-height: 1.6; padding-top: 80px; }
h1, h2, h3, h4 { font-family: 'Oswald', sans-serif; font-weight: 700; line-height: 1.1; letter-spacing: 0.01em; }
.material-icons { vertical-align: middle; }
.icon-sm { font-size: 18px; }

/* Navbar */
#navbar {
    position: fixed !important;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    transition: all 0.3s ease;
    background-color: transparent;
    width: 100%;
}
#navbar.navbar-scrolled {
    background-color: rgba(245, 247, 250, 0.96) !important;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(0, 51, 153, 0.08);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}
/* Dropdown hover fix */
#navbar .group:hover .group-hover\\:block {
    display: block !important;
}

/* Map styles (for contact page) */
.map-container {
    position: relative;
    width: 100%;
    overflow: hidden;
    border: 2px solid rgba(0, 51, 153, 0.1);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
}
.map-container iframe {
    width: 100%;
    height: 100%;
    min-height: 350px;
    border: 0;
    display: block;
}
.map-overlay {
    position: absolute;
    bottom: 12px;
    left: 12px;
    background: rgba(0, 51, 153, 0.95);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: #FFFFFF;
    padding: 10px 16px;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    z-index: 2;
    pointer-events: none;
    white-space: nowrap;
}
.map-overlay span { margin-right: 6px; }
@media (max-width: 640px) {
    .map-overlay { font-size: 0.65rem; padding: 8px 10px; white-space: normal; max-width: 90%; }
}
`;
document.head.appendChild(sharedStyles);

// ==========================================
// SHARED HEADER COMPONENT
// ==========================================
class myheader extends HTMLElement {
    connectedCallback() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const pageName = currentPage.replace('.html', '');
        
        const isActive = (page) => {
            if (page === pageName) return 'text-[#003399]';
            return 'text-[#1A202C]/70 hover:text-[#003399]';
        };
        
        this.innerHTML = `
            <header id="navbar" class="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-transparent">
                <nav class="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 lg:h-20">
                    <a href="index.html" class="flex items-center gap-3 flex-shrink-0">
                        <img src="src/bentoks_logo.png" alt="Bentoks Investments Logo" class="h-20 w-auto" />
                    </a>
                    <div class="hidden lg:flex items-center gap-7">
                        <a href="index.html" class="${isActive('index')} text-sm tracking-wide transition-colors">Home</a>
                        <a href="about.html" class="${isActive('about')} text-sm tracking-wide transition-colors">About</a>
                        <div class="relative group">
                            <a href="services.html" class="${isActive('services')} text-sm tracking-wide transition-colors flex items-center gap-1">Services <span class="material-icons icon-sm opacity-60">expand_more</span></a>
                            <div class="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-60 bg-[#FFFFFF] border border-[#003399]/10 shadow-2xl shadow-black/10 py-2 z-50 hidden group-hover:block">
                                <a href="services.html#T-Shirt" class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F5F7FA] transition-colors group">
                                    <span class="material-icons text-[#CC0000]/50 group-hover:text-[#CC0000]">checkroom</span>
                                    <span class="text-xs text-[#1A202C]/50 group-hover:text-[#1A202C]/80">T-Shirt Printing</span>
                                </a>
                                <a href="services.html#Banners" class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F5F7FA] transition-colors group">
                                    <span class="material-icons text-[#CC0000]/50 group-hover:text-[#CC0000]">flag</span>
                                    <span class="text-xs text-[#1A202C]/50 group-hover:text-[#1A202C]/80">Banners & Posters</span>
                                </a>
                                <a href="services.html#Billboards" class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F5F7FA] transition-colors group">
                                    <span class="material-icons text-[#CC0000]/50 group-hover:text-[#CC0000]">campaign</span>
                                    <span class="text-xs text-[#1A202C]/50 group-hover:text-[#1A202C]/80">Billboards Printing</span>
                                </a>
                                <a href="services.html#Custom" class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F5F7FA] transition-colors group">
                                    <span class="material-icons text-[#CC0000]/50 group-hover:text-[#CC0000]">palette</span>
                                    <span class="text-xs text-[#1A202C]/50 group-hover:text-[#1A202C]/80">Custom Designs</span>
                                </a>
                                <a href="services.html#Vehicle" class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F5F7FA] transition-colors group">
                                    <span class="material-icons text-[#CC0000]/50 group-hover:text-[#CC0000]">directions_car</span>
                                    <span class="text-xs text-[#1A202C]/50 group-hover:text-[#1A202C]/80">Vehicle Branding</span>
                                </a>
                                <a href="services.html#Signage" class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F5F7FA] transition-colors group">
                                    <span class="material-icons text-[#CC0000]/50 group-hover:text-[#CC0000]">storefront</span>
                                    <span class="text-xs text-[#1A202C]/50 group-hover:text-[#1A202C]/80">Signage</span>
                                </a>
                                <a href="services.html#Flyers" class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F5F7FA] transition-colors group">
                                    <span class="material-icons text-[#CC0000]/50 group-hover:text-[#CC0000]">description</span>
                                    <span class="text-xs text-[#1A202C]/50 group-hover:text-[#1A202C]/80">Flyers & Advertising Prints</span>
                                </a>
                                <a href="services.html#Business" class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F5F7FA] transition-colors group">
                                    <span class="material-icons text-[#CC0000]/50 group-hover:text-[#CC0000]">badge</span>
                                    <span class="text-xs text-[#1A202C]/50 group-hover:text-[#1A202C]/80">Business Cards</span>
                                </a>
                                <a href="services.html#Brochures" class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F5F7FA] transition-colors group">
                                    <span class="material-icons text-[#CC0000]/50 group-hover:text-[#CC0000]">menu_book</span>
                                    <span class="text-xs text-[#1A202C]/50 group-hover:text-[#1A202C]/80">Brochures</span>
                                </a>
                            </div>
                        </div>
                        <a href="portfolio.html" class="${isActive('portfolio')} text-sm tracking-wide transition-colors">Portfolio</a>
                        <a href="contact.html" class="${isActive('contact')} text-sm tracking-wide transition-colors">Contact</a>
                    </div>
                    <div class="hidden lg:flex items-center gap-5">
                        <a href="tel:+26876320436" class="flex items-center gap-2 text-[#1A202C]/50 hover:text-[#003399] text-sm transition-colors">
                            <span class="material-icons text-[#003399]">phone</span>+268 7632 0436
                        </a>
                        <a href="quote.html" class="bg-[#003399] hover:bg-[#0047AB] text-white font-heading font-semibold text-xs tracking-[0.2em] uppercase px-6 py-2.5 transition-all hover:shadow-lg hover:shadow-[#003399]/25">Request a Quote</a>
                    </div>
                    <button id="mobile-menu-btn" class="lg:hidden text-[#1A202C] p-1">
                        <span id="menu-icon" class="material-icons text-2xl">menu</span>
                    </button>
                </nav>
                <div id="mobile-menu" class="lg:hidden bg-[#FFFFFF] border-t border-[#003399]/8 hidden">
                    <a href="index.html" class="w-full text-left px-6 py-4 text-sm border-b border-[#003399]/5 transition-colors ${pageName === 'index' ? 'text-[#003399]' : 'text-[#1A202C]/70'} block">Home</a>
                    <a href="about.html" class="w-full text-left px-6 py-4 text-sm border-b border-[#003399]/5 transition-colors ${pageName === 'about' ? 'text-[#003399]' : 'text-[#1A202C]/70'} block">About</a>
                    <a href="services.html" class="w-full text-left px-6 py-4 text-sm border-b border-[#003399]/5 transition-colors ${pageName === 'services' ? 'text-[#003399]' : 'text-[#1A202C]/70'} block">Services</a>
                    <a href="portfolio.html" class="w-full text-left px-6 py-4 text-sm border-b border-[#003399]/5 transition-colors ${pageName === 'portfolio' ? 'text-[#003399]' : 'text-[#1A202C]/70'} block">Portfolio</a>
                    <a href="contact.html" class="w-full text-left px-6 py-4 text-sm border-b border-[#003399]/5 transition-colors ${pageName === 'contact' ? 'text-[#003399]' : 'text-[#1A202C]/70'} block">Contact</a>
                    <div class="p-4"><a href="quote.html" class="w-full bg-[#003399] text-white font-heading font-semibold text-xs tracking-[0.2em] uppercase py-3 block text-center">Request a Quote</a></div>
                </div>
            </header>
        `;

        const mobileBtn = this.querySelector('#mobile-menu-btn');
        const mobileMenu = this.querySelector('#mobile-menu');
        const menuIcon = this.querySelector('#menu-icon');
        
        mobileBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            menuIcon.textContent = mobileMenu.classList.contains('hidden') ? 'menu' : 'close';
        });

        const navbar = this.querySelector('#navbar');
        window.addEventListener('scroll', () => {
            if (window.scrollY > 40) {
                navbar.classList.add('navbar-scrolled');
                navbar.classList.remove('bg-transparent');
            } else {
                navbar.classList.remove('navbar-scrolled');
                navbar.classList.add('bg-transparent');
            }
        });
    }   
}
customElements.define('my-header', myheader);

// ==========================================
// SHARED FOOTER COMPONENT
// ==========================================
class myfooter extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <footer class="bg-[#003399] border-t border-white/5">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
                        <div>
                            <a href="index.html" class="flex items-center gap-3 mb-6">
                                <img src="src/bentoks_logo.png" alt="Bentoks Investments Logo" class="h-20 w-auto" />
                            </a>
                            <p class="text-white/35 text-xs leading-relaxed mb-6">High-quality printing that brings your brand to life. We specialize in billboards, banners, t-shirts, and custom prints for businesses and individuals since 2017.</p>
                            <div class="flex gap-2">
                                <a href="#" class="w-8 h-8 border border-white/10 hover:border-white/40 hover:bg-white/8 flex items-center justify-center text-white/25 hover:text-white transition-all">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                    </svg>
                                </a>
                                <a href="#" class="w-8 h-8 border border-white/10 hover:border-white/40 hover:bg-white/8 flex items-center justify-center text-white/25 hover:text-white transition-all">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                                    </svg>
                                </a>
                                <a href="#" class="w-8 h-8 border border-white/10 hover:border-white/40 hover:bg-white/8 flex items-center justify-center text-white/25 hover:text-white transition-all">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                                    </svg>
                                </a>
                                <a href="#" class="w-8 h-8 border border-white/10 hover:border-white/40 hover:bg-white/8 flex items-center justify-center text-white/25 hover:text-white transition-all">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                    </svg>
                                </a>
                            </div>
                        </div>
                        <div>
                            <h4 class="font-heading text-white font-semibold text-sm tracking-[0.1em] mb-5">SERVICES</h4>
                            <ul class="space-y-2.5">
                                <li><a href="services.html#T-Shirt" class="text-white/35 hover:text-white text-xs transition-colors text-left leading-relaxed">T-Shirt Printing</a></li>
                                <li><a href="services.html#Banners" class="text-white/35 hover:text-white text-xs transition-colors text-left leading-relaxed">Banners & Posters</a></li>
                                <li><a href="services.html#Billboards" class="text-white/35 hover:text-white text-xs transition-colors text-left leading-relaxed">Billboards Printing</a></li>
                                <li><a href="services.html#Custom" class="text-white/35 hover:text-white text-xs transition-colors text-left leading-relaxed">Custom Designs</a></li>
                                <li><a href="services.html#Vehicle" class="text-white/35 hover:text-white text-xs transition-colors text-left leading-relaxed">Vehicle Branding</a></li>
                                <li><a href="services.html#Signage" class="text-white/35 hover:text-white text-xs transition-colors text-left leading-relaxed">Signage</a></li>
                                <li><a href="services.html#Flyers" class="text-white/35 hover:text-white text-xs transition-colors text-left leading-relaxed">Flyers & Advertising Prints</a></li>
                                <li><a href="services.html#Business" class="text-white/35 hover:text-white text-xs transition-colors text-left leading-relaxed">Business Cards</a></li>
                                <li><a href="services.html#Brochures" class="text-white/35 hover:text-white text-xs transition-colors text-left leading-relaxed">Brochures</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 class="font-heading text-white font-semibold text-sm tracking-[0.1em] mb-5">COMPANY</h4>
                            <ul class="space-y-2.5 mb-8">
                                <li><a href="about.html" class="text-white/35 hover:text-white text-xs transition-colors text-left">About Us</a></li>
                                <li><a href="portfolio.html" class="text-white/35 hover:text-white text-xs transition-colors text-left">Portfolio</a></li>
                                <li><a href="services.html" class="text-white/35 hover:text-white text-xs transition-colors text-left">Services</a></li>
                                <li><a href="contact.html" class="text-white/35 hover:text-white text-xs transition-colors text-left">Contact Us</a></li>
                                <li><a href="quote.html" class="text-white/35 hover:text-white text-xs transition-colors text-left">Request a Quote</a></li>
                            </ul>
                            <h4 class="font-heading text-white font-semibold text-sm tracking-[0.1em] mb-4">CONTACT</h4>
                            <div class="space-y-2.5">
                                <div class="flex items-start gap-2 text-white/35 text-xs"><span class="material-icons text-white flex-shrink-0 mt-0.5">location_on</span>Mbabane, Sidwashini Ind.site, Zenkosi Complex, Block A, Office A2</div>
                                <div class="flex items-center gap-2 text-white/35 text-xs"><span class="material-icons text-white flex-shrink-0">phone</span>+268 7632 0436 / +268 7932 0436 / +268 3402 9328</div>
                                <div class="flex items-center gap-2 text-white/35 text-xs"><span class="material-icons text-white flex-shrink-0">mail</span>ntokozographics@gmail.com / bentoksinvestments@gmail.com</div>
                                <div class="flex items-start gap-2 text-white/35 text-xs"><span class="material-icons text-white flex-shrink-0 mt-0.5">mail</span>P.O. Box 8740, Mbabane H100, Eswatini</div>
                            </div>
                        </div>
                        <div>
                            <h4 class="font-heading text-white font-semibold text-sm tracking-[0.1em] mb-5">NEWSLETTER</h4>
                            <p class="text-white/35 text-xs leading-relaxed mb-4">Latest branding trends delivered to your inbox.</p>
                            <form class="newsletter-form space-y-2">
                                <input type="email" required placeholder="Your email" class="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 text-xs px-3 py-2.5 outline-none focus:border-white/50 transition-colors" />
                                <button type="submit" class="w-full bg-[#CC0000] hover:bg-[#DD0000] text-white font-heading font-semibold text-xs tracking-[0.15em] uppercase py-2.5 transition-colors flex items-center justify-center gap-1.5">
                                    <span class="material-icons">mail</span> Subscribe
                                </button>
                            </form>
                            <div class="newsletter-success flex items-center gap-2 text-white text-xs hidden mt-3"><span class="material-icons">check_circle</span> Subscribed — thank you!</div>
                            <div class="mt-8">
                                <h4 class="font-heading text-white font-semibold text-sm tracking-[0.1em] mb-3">HOURS</h4>
                                <div class="space-y-1.5 text-xs">
                                    <div class="flex justify-between text-white/35"><span>Mon – Fri</span><span>08:00 – 17:00</span></div>
                                    <div class="flex justify-between text-white/35"><span>Saturday</span><span>08:00 – 13:00</span></div>
                                    <div class="flex justify-between text-white/20"><span>Sunday</span><span>Closed</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4"><p class="text-white/30 text-xs">© 2026 Bentoks Investments. All rights reserved.</p></div>
                </div>
            </footer>

            <!-- Floating WhatsApp Button -->
            <a href="https://wa.me/26876320436?text=Hello%20Bentoks%2C%20I%20would%20like%20to%20enquire%20about%20your%20services." target="_blank" rel="noopener noreferrer" class="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] hover:bg-[#1EBE5D] shadow-xl shadow-[#25D366]/30 flex items-center justify-center transition-all hover:scale-110 group" style="border-radius:50%">
                <span class="material-icons text-white text-2xl">chat</span>
                <div class="absolute right-full mr-3 bg-[#003399] text-white text-xs px-3 py-1.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 shadow-xl pointer-events-none">Chat on WhatsApp</div>
            </a>
        `;

        // Handle newsletter form
        const form = this.querySelector('.newsletter-form');
        const success = this.querySelector('.newsletter-success');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                form.classList.add('hidden');
                success.classList.remove('hidden');
            });
        }
    }
}
customElements.define('my-footer', myfooter);
