// Aguarda a página HTML carregar completamente antes de rodar o script
document.addEventListener("DOMContentLoaded", () => {

    // --- CONFIGURAÇÃO ---
    const appsScriptUrl = "https://script.google.com/macros/s/AKfycbzMUsAasaYX8a0XKL_hGzPKIQC7Ub_Ep56vGtMGF_FjJPOpE5HPbwdOTBzRwgL3nvZQxg/exec"; 

    // --- VARIÁVEIS DE ESTADO ---
    let currentMode = "add";
    let isSending = false;
    let messageTimer;
    let currentScannedCode = null;
    let currentActiveTab = "scanner";
    let html5QrcodeScanner; // Instância será mantida aqui
    let isScannerInitialized = false; // Controla se o .render() está ATIVO
    let installPromptEvent = null; // Guarda o evento de instalação

    // --- REFERÊNCIAS AOS ELEMENTOS HTML ---
    
    // Aba Scanner
    const modoBtn = document.getElementById("modo-btn");
    const statusMsg = document.getElementById("status-msg");

    // Senha (Global)
    const passwordInput = document.getElementById("secret-password-input");

    // Modal
    const mappingModal = document.getElementById("mapping-modal");
    const mappingItemList = document.getElementById("mapping-item-list");
    const mappingBarcode = document.getElementById("mapping-barcode");
    const mappingAssociateBtn = document.getElementById("mapping-associate-btn");
    const mappingCancelBtn = document.getElementById("mapping-cancel-btn");

    // Navegação e Abas
    const navScanner = document.getElementById("nav-scanner");
    const navLista = document.getElementById("nav-lista");
    const secaoScanner = document.getElementById("secao-scanner");
    const secaoLista = document.getElementById("secao-lista");

    // Aba Lista de Compras
    const btnSincronizarNotion = document.getElementById("btn-sincronizar-notion");
    const btnInstalarPWA = document.getElementById("btn-instalar-pwa");

    // --- NOVO: LÓGICA DE CRIAÇÃO DO SCANNER ---
    // A instância do scanner é criada UMA VEZ quando a página carrega.
    // As funções .render() e .clear() serão chamadas ao trocar de aba.
    html5QrcodeScanner = new Html5QrcodeScanner(
        "leitor", // ID da <div> no HTML
        {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true
        },
        false // verbosidade
    );

    // --- LÓGICA DE NAVEGAÇÃO POR ABAS (MODIFICADA) ---

    function showTab(tabName) {
        currentActiveTab = tabName;

        if (tabName === "scanner") {
            // Mostra a seção do scanner
            secaoScanner.classList.remove("hidden");
            secaoLista.classList.add("hidden");
            navScanner.classList.add("active");
            navLista.classList.remove("active");
            showStatusMessage("Aponte para um código de barras");

            // Inicia a câmera do scanner
            // A flag isScannerInitialized agora significa "câmera está ativa"
            if (!isScannerInitialized) {
                // Chama .render() para ligar a câmera
                html5QrcodeScanner.render(onScanSuccess, onScanFailure);
                isScannerInitialized = true;
            }

        } else if (tabName === "lista") {
            // Mostra a seção da lista
            secaoScanner.classList.add("hidden");
            secaoLista.classList.remove("hidden");
            navScanner.classList.remove("active");
            navLista.classList.add("active");
            showStatusMessage("Pronto para sincronizar.");

            // Para a câmera do scanner para evitar duplicidade
            if (isScannerInitialized) {
                html5QrcodeScanner.clear().then(() => {
                    isScannerInitialized = false; // Marca que a câmera foi desligada
                    console.log("Scanner parado com sucesso.");
                }).catch(err => {
                    console.error("Falha ao parar o scanner.", err);
                    // Força a flag para falso para tentar renderizar novamente na próxima vez
                    isScannerInitialized = false; 
                });
            }
        }
    }

    navScanner.addEventListener("click", () => showTab("scanner"));
    navLista.addEventListener("click", () => showTab("lista"));


    // --- LÓGICA DO BOTÃO DE MODO (Aba Scanner) ---
    modoBtn.addEventListener("click", () => {
        if (currentMode === "add") {
            currentMode = "remove";
            modoBtn.textContent = "REMOVER";
            modoBtn.classList.remove("add-mode");
            modoBtn.classList.add("remove-mode");
        } else {
            currentMode = "add";
            modoBtn.textContent = "ADICIONAR";
            modoBtn.classList.remove("remove-mode");
            modoBtn.classList.add("add-mode");
        }
    });

    // --- LÓGICA DO SCANNER ---
    // (A função initializeScanner() foi removida)

    function onScanSuccess(codigoLido, decodedResult) {
        // Ignora scans se já estiver enviando ou se a aba não for o scanner
        if (isSending || currentActiveTab !== 'scanner') {
            return;
        }
        isSending = true;
        currentScannedCode = codigoLido;
        
        if (navigator.vibrate) {
            navigator.vibrate(100);
        }
        sendScanData(codigoLido);
    }

    function onScanFailure(error) {
        // Apenas ignora falhas de scan (ex: código não focado)
    }

    // --- LÓGICA DE COMUNICAÇÃO (FETCH) ---

    // 1. Função chamada pelo SCANNER (Modo: "add" / "remove")
    async function sendScanData(codigoLido) {
        showStatusMessage("Enviando dados...", false);
        
        const payload = {
            codigo: codigoLido,
            modo: currentMode,
            senha: passwordInput.value
        };

        try {
            const result = await sendRequest(payload);
            if (result.status === "success") {
                showStatusMessage(`✅ ${result.item} ${currentMode === 'add' ? 'adicionado' : 'removido'} (Total: ${result.novaQuantidade})`, false);
                resetSendingLock();
            } else if (result.status === "not_mapped") {
                showStatusMessage("❓ Item não reconhecido. Mapear...", true);
                await showMappingModal(codigoLido);
            } else {
                throw new Error(result.message || "Erro desconhecido.");
            }
        } catch (error) {
            console.error("Erro em sendScanData:", error);
            showStatusMessage(`❌ Erro: ${error.message}`, true);
            resetSendingLock();
        }
    }

    // 2. Função chamada pelo MODAL (Modo: "map")
    async function sendMappingData() {
        const itemGenerico = mappingItemList.value;
        const codigoLido = currentScannedCode;

        if (!itemGenerico) {
            alert("Por favor, selecione um item da lista.");
            return;
        }

        showStatusMessage("Mapeando e adicionando...", false);
        hideMappingModal();

        const payload = {
            codigo: codigoLido,
            modo: "map",
            itemGenerico: itemGenerico,
            senha: passwordInput.value
        };
        try {
            const result = await sendRequest(payload);
            if (result.status === "success") {
                showStatusMessage(`✅ ${result.item} mapeado e adicionado! (Total: ${result.novaQuantidade})`, false);
            } else {
                throw new Error(result.message || "Erro ao mapear.");
            }
        } catch (error) {
            console.error("Erro em sendMappingData:", error);
            showStatusMessage(`❌ Erro: ${error.message}`, true);
        } finally {
            resetSendingLock();
        }
    }

    // 3. Função chamada pelo MODAL (Modo: "getItens")
    async function fetchEstoqueItens() {
        mappingItemList.innerHTML = '<option value="">Carregando...</option>';
        
        const payload = {
            modo: "getItens",
            senha: passwordInput.value
        };
        
        try {
            const result = await sendRequest(payload);
            if (result.status === "success" && result.itens) {
                mappingItemList.innerHTML = '';
                if (result.itens.length === 0) {
                     mappingItemList.innerHTML = '<option value="">Nenhum item no estoque</option>';
                     return;
                }
                mappingItemList.appendChild(new Option("Selecione uma categoria...", ""));
                result.itens.forEach(item => {
                    mappingItemList.appendChild(new Option(item, item));
                });
            } else {
                throw new Error(result.message || "Não foi possível carregar itens.");
            }
        } catch (error) {
            console.error("Erro em fetchEstoqueItens:", error);
            mappingItemList.innerHTML = `<option value="">Erro ao carregar</option>`;
            showStatusMessage(`❌ ${error.message}`, true);
            resetSendingLock();
            hideMappingModal();
        }
    }

    // 4. Função chamada pela ABA LISTA (Modo: "syncNotion")
    async function handleSyncNotionClick() {
        if (isSending) {
            showStatusMessage("Aguarde, operação anterior em andamento...", true);
            return;
        }
        
        isSending = true;
        showStatusMessage("Sincronizando com o Notion...", false);

        const payload = {
            modo: "syncNotion",
            senha: passwordInput.value
        };

        try {
            const result = await sendRequest(payload);
            if (result.status === "success") {
                showStatusMessage(`✅ ${result.message}`, false);
            } else {
                throw new Error(result.message || "Erro ao sincronizar.");
            }
        } catch (error) {
            console.error("Erro em handleSyncNotionClick:", error);
            showStatusMessage(`❌ Erro: ${error.message}`, true);
        } finally {
            resetSendingLock(1000);
        }
    }

    // Evento para o botão de Sincronizar
    btnSincronizarNotion.addEventListener("click", handleSyncNotionClick);
    
    // Evento para o botão de Instalar
    btnInstalarPWA.addEventListener("click", async () => {
        if (!installPromptEvent) {
            alert("Não é possível instalar o app neste momento.");
            return;
        }
        installPromptEvent.prompt();
        const { outcome } = await installPromptEvent.userChoice;
        if (outcome === 'accepted') {
            console.log('Usuário aceitou a instalação');
            btnInstalarPWA.style.display = 'none';
        } else {
            console.log('Usuário recusou a instalação');
        }
        installPromptEvent = null;
    });


    // 5. Função GENÉRICA que envia a requisição
    async function sendRequest(payload) {
        const response = await fetch(appsScriptUrl, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            redirect: "follow" 
        });
        
        if (!response.ok) {
            throw new Error(`Erro de rede: ${response.statusText}`);
        }
        
        return await response.json();
    }

    // --- LÓGICA DO MODAL DE MAPEAMENTO ---

    async function showMappingModal(codigoLido) {
        mappingBarcode.textContent = codigoLido;
        mappingModal.style.display = "flex";
        await fetchEstoqueItens(); 
    }

    function hideMappingModal() {
        mappingModal.style.display = "none";
    }

    mappingAssociateBtn.addEventListener("click", () => {
        sendMappingData();
    });

    mappingCancelBtn.addEventListener("click", () => {
        hideMappingModal();
        resetSendingLock();
        showStatusMessage("Scan cancelado. Aponte para um código.", true);
    });


    // --- FUNÇÕES AUXILIARES ---
    
    function showStatusMessage(message, isError = false) {
        clearTimeout(messageTimer);
        
        statusMsg.textContent = message;
        statusMsg.classList.remove('success', 'error'); 
        if (isError) {
            statusMsg.classList.add('error');
        } else if (message) {
             statusMsg.classList.add('success');
        }

        messageTimer = setTimeout(() => {
            if (!isSending) { 
                if (currentActiveTab === 'scanner') {
                    statusMsg.textContent = "Aponte para um código de barras";
                } else {
                    statusMsg.textContent = "Pronto para sincronizar.";
                }
                statusMsg.classList.remove('success', 'error');
            }
        }, 5000);
    }
    
    function resetSendingLock(delay = 1000) {
        setTimeout(() => {
            isSending = false;
            currentScannedCode = null;
            if (currentActiveTab === 'scanner') {
                 showStatusMessage("Aponte para um código de barras");
            } else {
                 showStatusMessage("Pronto para sincronizar.");
            }
        }, delay);
    }

    // --- INICIALIZAÇÃO DA PÁGINA E PWA ---

    // Define a aba "scanner" como inicial e inicia a câmera
    showTab("scanner");

    // Listener para o evento de instalação do PWA
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        installPromptEvent = event;
        btnInstalarPWA.style.display = 'block';
    });

});
