document.addEventListener('DOMContentLoaded', function() {
    const imageInput = document.getElementById('imageInput');
    const compressionPercentage = document.getElementById('compressionPercentage');
    const percentageValue = document.getElementById('percentageValue');
    const compressBtn = document.getElementById('compressBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const results = document.getElementById('results');
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    const compressionSettings = document.getElementById('compressionSettings');
    const pdfSettings = document.getElementById('pdfSettings');
    const targetSizeInput = document.getElementById('targetSize');

    let selectedFiles = [];
    let currentMode = 'compress';

    // Update percentage display
    compressionPercentage.addEventListener('input', function() {
        percentageValue.textContent = this.value;
    });

    // Handle file selection
    imageInput.addEventListener('change', function(e) {
        selectedFiles = Array.from(e.target.files);
        updateCompressButton();
    });

    // Handle mode change
    modeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            currentMode = this.value;
            if (currentMode === 'compress') {
                compressionSettings.classList.remove('hidden');
                pdfSettings.classList.add('hidden');
                imageInput.accept = 'image/*,.pdf';
            } else {
                compressionSettings.classList.add('hidden');
                pdfSettings.classList.remove('hidden');
                imageInput.accept = 'image/*';
            }
            updateCompressButton();
        });
    });

    function updateCompressButton() {
        if (selectedFiles.length > 0) {
            if (currentMode === 'compress') {
                compressBtn.textContent = `Compress ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''}`;
            } else {
                compressBtn.textContent = `Create PDF from ${selectedFiles.length} Image${selectedFiles.length > 1 ? 's' : ''}`;
            }
            compressBtn.disabled = false;
        } else {
            compressBtn.textContent = currentMode === 'compress' ? 'Compress Files' : 'Create PDF';
            compressBtn.disabled = true;
        }
    }

    async function compressPDF(file, percentage, onProgress) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        const numPages = pdf.numPages;
        const compressedImages = [];

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const scale = 2;
            const viewport = page.getViewport({scale});
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({canvasContext: context, viewport}).promise;
            const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
            const imageFile = new File([imageBlob], `page-${pageNum}.jpg`, {type: 'image/jpeg'});
            const targetSizeMB = (imageBlob.size * (1 - percentage / 100)) / (1024 * 1024);
            const compressedImage = await imageCompression(imageFile, {
                maxSizeMB: Math.max(targetSizeMB, 0.01),
                maxWidthOrHeight: 1920,
                useWebWorker: true
            });
            compressedImages.push(compressedImage);
            onProgress((pageNum / numPages) * 100);
        }

        const { PDFDocument } = PDFLib;
        const newPdf = await PDFDocument.create();
        for (const img of compressedImages) {
            const imgBytes = await img.arrayBuffer();
            const pdfImage = await newPdf.embedJpg(imgBytes);
            const page = newPdf.addPage([pdfImage.width, pdfImage.height]);
            page.drawImage(pdfImage, {
                x: 0,
                y: 0,
                width: pdfImage.width,
                height: pdfImage.height,
            });
        }
        const pdfBytes = await newPdf.save();
        const compressedPdf = new File([pdfBytes], file.name.replace(/\.pdf$/i, '_compressed.pdf'), {type: 'application/pdf'});
        return compressedPdf;
    }

    async function createPDFFromImages(images, targetSizeMB, onProgress) {
        const numImages = images.length;
        const targetPerImageMB = Math.max(targetSizeMB / numImages, 0.01);
        const compressedImages = [];

        for (let i = 0; i < numImages; i++) {
            const compressedImage = await imageCompression(images[i], {
                maxSizeMB: targetPerImageMB,
                maxWidthOrHeight: 1920,
                useWebWorker: true
            });
            compressedImages.push(compressedImage);
            onProgress(((i + 1) / numImages) * 100);
        }

        const { PDFDocument } = PDFLib;
        const newPdf = await PDFDocument.create();
        for (const img of compressedImages) {
            const imgBytes = await img.arrayBuffer();
            let pdfImage;
            if (img.type === 'image/jpeg' || img.type === 'image/jpg') {
                pdfImage = await newPdf.embedJpg(imgBytes);
            } else {
                pdfImage = await newPdf.embedPng(imgBytes);
            }
            const page = newPdf.addPage([pdfImage.width, pdfImage.height]);
            page.drawImage(pdfImage, {
                x: 0,
                y: 0,
                width: pdfImage.width,
                height: pdfImage.height,
            });
        }
        const pdfBytes = await newPdf.save();
        const pdfFile = new File([pdfBytes], 'combined_images.pdf', {type: 'application/pdf'});
        return pdfFile;
    }

    // Process files
    compressBtn.addEventListener('click', async function() {
        if (selectedFiles.length === 0) return;

        compressBtn.disabled = true;
        compressBtn.textContent = 'Processing...';
        progressContainer.classList.remove('hidden');
        results.innerHTML = '';

        if (currentMode === 'createpdf') {
            // Validate all files are images
            const nonImages = selectedFiles.filter(f => !f.type.startsWith('image/'));
            if (nonImages.length > 0) {
                displayError('Invalid Files', 'Only image files are allowed for PDF creation.');
                progressContainer.classList.add('hidden');
                compressBtn.disabled = false;
                compressBtn.textContent = 'Create PDF';
                return;
            }

            try {
                const targetSizeMB = parseFloat(targetSizeInput.value);
                const totalOriginalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
                const pdfFile = await createPDFFromImages(selectedFiles, targetSizeMB, (progress) => {
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `Creating PDF... ${Math.round(progress)}%`;
                });

                progressBar.style.width = '100%';
                progressText.textContent = 'PDF Created';

                displayResult({name: 'Combined Images'}, pdfFile, totalOriginalSize);
            } catch (error) {
                console.error('Error creating PDF:', error);
                displayError('PDF Creation', error.message);
            }
        } else {
            // Compress mode
            const percentage = parseInt(compressionPercentage.value);
            let completed = 0;
            const total = selectedFiles.length;

            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                try {
                    const originalSize = file.size;
                    let compressedFile;

                    if (file.type === 'application/pdf') {
                        compressedFile = await compressPDF(file, percentage, (progress) => {
                            const overallProgress = ((completed + progress / 100) / total) * 100;
                            progressBar.style.width = `${overallProgress}%`;
                            progressText.textContent = `Processing ${file.name}... ${Math.round(progress)}%`;
                        });
                    } else {
                        const targetSizeMB = (originalSize * (1 - percentage / 100)) / (1024 * 1024);
                        compressedFile = await imageCompression(file, {
                            maxSizeMB: Math.max(targetSizeMB, 0.01), // Minimum 10KB
                            maxWidthOrHeight: 1920,
                            useWebWorker: true,
                            onProgress: (progress) => {
                                const overallProgress = ((completed + progress / 100) / total) * 100;
                                progressBar.style.width = `${overallProgress}%`;
                                progressText.textContent = `Processing ${file.name}... ${Math.round(progress)}%`;
                            }
                        });
                    }

                    completed++;
                    const overallProgress = (completed / total) * 100;
                    progressBar.style.width = `${overallProgress}%`;
                    progressText.textContent = `Completed ${completed}/${total} files`;

                    displayResult(file, compressedFile, originalSize);
                } catch (error) {
                    console.error('Error compressing file:', error);
                    displayError(file.name, error.message);
                }
            }
        }

        progressContainer.classList.add('hidden');
        compressBtn.disabled = false;
        updateCompressButton();
    });

    function displayResult(originalFile, compressedFile, originalSize) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'image-result';

        const compressionRatio = ((originalSize - compressedFile.size) / originalSize * 100).toFixed(1);
        const sizeReduction = formatBytes(originalSize - compressedFile.size);

        resultDiv.innerHTML = `
            <h3>${originalFile.name}</h3>
            <div class="image-info">
                <span>Original: ${formatBytes(originalSize)}</span>
                <span>Compressed: ${formatBytes(compressedFile.size)}</span>
                <span>Saved: ${sizeReduction} (${compressionRatio}%)</span>
            </div>
            <button class="download-btn" onclick="downloadImage('${URL.createObjectURL(compressedFile)}', '${compressedFile.name}')">Download</button>
        `;

        results.appendChild(resultDiv);
    }

    function displayError(fileName, errorMessage) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'image-result';
        errorDiv.style.borderColor = '#f44336';
        errorDiv.style.backgroundColor = '#ffebee';

        errorDiv.innerHTML = `
            <h3>${fileName}</h3>
            <p style="color: #f44336; margin: 0;">Error: ${errorMessage}</p>
        `;

        results.appendChild(errorDiv);
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});

// Download function
function downloadImage(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
