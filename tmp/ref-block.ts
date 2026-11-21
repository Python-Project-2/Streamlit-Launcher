/** Satu entri artikel jurnal: penulis (tahun). judul. *venue*, vol(issue), halaman. */
const art = (
	cite1: string, citeN: string, authors: string, year: string, title: string,
	venue: string, vol: string, issue: string, pages: string, link: string, tail = '',
): Ref => ({
	first: cite1, next: citeN, link,
	runs: [
		t(`${authors} (${year}). ${title}. `),
		it(venue),
		t(`${vol ? `, ${vol}${issue ? `(${issue})` : ''}` : ''}${pages ? `, ${pages}` : ''}.${tail ? ` ${tail}` : ''}`),
	],
});

/** Satu entri buku: penulis (tahun). *judul* (edisi). Penerbit. */
const book = (cite1: string, citeN: string, authors: string, year: string, title: string, edition: string, publisher: string, link: string): Ref => ({
	first: cite1, next: citeN, link,
	runs: [t(`${authors} (${year}). `), it(title), t(`${edition ? ` (${edition})` : ''}. ${publisher}.`)],
});

/**
 * Katalog rujukan artikel. Seluruh terbitan 2022–2026 dan setiap entri memiliki
 * tautan DOI/URL aktif sehingga pembaca dapat langsung membuka sumbernya.
 */
const CAT: Record<string, Ref> = {
	dqDimensions: art('Ridzuan & Zainon, 2024', 'Ridzuan & Zainon, 2024', 'Ridzuan, F., & Zainon, W. M. N. W.', '2024', 'A review on data quality dimensions for big data', 'Procedia Computer Science', '234', '', '341–348', 'https://doi.org/10.1016/j.procs.2024.03.008'),
	dqAssessment: art('Reda, Benabdellah, & Zellou, 2023', 'Reda et al., 2023', 'Reda, O., Benabdellah, N. C., & Zellou, A.', '2023', 'A systematic literature review on data quality assessment', 'Bulletin of Electrical Engineering and Informatics', '12', '6', '', 'https://doi.org/10.11591/eei.v12i6.5667'),
	dqFramework: art('Rahal et al., 2025', 'Rahal et al., 2025', 'Rahal, M., Ahmed, B. S., Szabados, G., Fornstedt, T., & Samuelsson, J.', '2025', 'Enhancing machine learning performance through intelligent data quality assessment: An unsupervised data-centric framework', 'Heliyon', '11', '4', 'e42777', 'https://doi.org/10.1016/j.heliyon.2025.e42777'),
	dqDeepLearning: art('Whang, Roh, Song, & Lee, 2023', 'Whang et al., 2023', 'Whang, S. E., Roh, Y., Song, H., & Lee, J.-G.', '2023', 'Data collection and quality challenges in deep learning: A data-centric AI perspective', 'The VLDB Journal', '32', '4', '791–813', 'https://doi.org/10.1007/s00778-022-00775-9'),
	dataCentric: art('Zha et al., 2025', 'Zha et al., 2025', 'Zha, D., Bhat, Z. P., Lai, K.-H., Yang, F., Jiang, Z., Zhong, S., & Hu, X.', '2025', 'Data-centric artificial intelligence: A survey', 'ACM Computing Surveys', '57', '5', '1–42', 'https://doi.org/10.1145/3711118'),
	dataMining: book('Han, Pei, & Tong, 2022', 'Han et al., 2022', 'Han, J., Pei, J., & Tong, H.', '2022', 'Data mining: Concepts and techniques', '4th ed.', 'Morgan Kaufmann', 'https://shop.elsevier.com/books/data-mining/han/978-0-12-811760-2'),
	tidyData: art('Tierney & Cook, 2023', 'Tierney & Cook, 2023', 'Tierney, N., & Cook, D.', '2023', 'Expanding tidy data principles to facilitate missing data exploration, visualization and assessment of imputations', 'Journal of Statistical Software', '105', '7', '', 'https://doi.org/10.18637/jss.v105.i07'),
	missingData: art('Yang & Gaskin, 2025', 'Yang & Gaskin, 2025', 'Yang, M., & Gaskin, D. J.', '2025', 'Handling missing data in partially clustered randomized controlled trials', 'Psychological Methods', '30', '5', '927–948', 'https://doi.org/10.1037/met0000612'),
	imputation: art('Chen & Chang, 2024', 'Chen & Chang, 2024', 'Chen, C.-Y., & Chang, Y.-W.', '2024', 'Missing data imputation using classification and regression trees', 'PeerJ Computer Science', '10', '', 'e2119', 'https://doi.org/10.7717/peerj-cs.2119'),
	iqr: art('Azhari, Wulandari, Adiningrat, & Alexander, 2025', 'Azhari et al., 2025', 'Azhari, L., Wulandari, N., Adiningrat, F., & Alexander, A. D.', '2025', 'Model prediksi penyakit jantung dengan penanganan outlier menggunakan interquartile range dan extreme gradient boosting', 'Journal of Information System Research (JOSH)', '6', '2', '', 'https://doi.org/10.47065/josh.v6i2.6390'),
	outlierStream: art('Souiden, Omri, & Brahmi, 2022', 'Souiden et al., 2022', 'Souiden, I., Omri, M. N., & Brahmi, Z.', '2022', 'A survey of outlier detection in high dimensional data streams', 'Computer Science Review', '44', '', '100463', 'https://doi.org/10.1016/j.cosrev.2022.100463'),
	outlierMeta: art('Olteanu, Rossi, & Yger, 2023', 'Olteanu et al., 2023', 'Olteanu, M., Rossi, F., & Yger, F.', '2023', 'Meta-survey on outlier and anomaly detection', 'Neurocomputing', '555', '', '126634', 'https://doi.org/10.1016/j.neucom.2023.126634'),
	normality: art('Demir, 2022', 'Demir, 2022', 'Demir, S.', '2022', 'Comparison of normality tests in terms of sample sizes under different skewness and kurtosis coefficients', 'International Journal of Assessment Tools in Education', '9', '2', '397–409', 'https://doi.org/10.21449/ijate.1101295'),
	skewness: art('Hatem, Zeidan, Goossens, & Moreira, 2022', 'Hatem et al., 2022', 'Hatem, G., Zeidan, J., Goossens, M., & Moreira, C.', '2022', 'Normality testing methods and the importance of skewness and kurtosis in statistical analysis', 'BAU Journal - Science and Technology', '3', '2', '', 'https://doi.org/10.54729/ktpe9512'),
	method: art('Efendi & Mustofa, 2024', 'Efendi & Mustofa, 2024', 'Efendi, M., & Mustofa, N. H.', '2024', 'Memahami esensi metode penelitian kuantitatif', 'TSAQOFAH', '4', '5', '3745–3755', 'https://doi.org/10.58578/tsaqofah.v4i5.3586'),
	regression: art('Koirala, 2025', 'Koirala, 2025', 'Koirala, R.', '2025', 'Guidelines for simple linear regression analysis in IBM SPSS: A step-by-step approach', 'International Research Journal of MMC', '6', '1', '53–67', 'https://doi.org/10.3126/irjmmc.v6i1.77479'),
	significance: art('McShane, Bradlow, Lynch, & Meyer, 2024', 'McShane et al., 2024', 'McShane, B. B., Bradlow, E. T., Lynch, J. G., & Meyer, R. J.', '2024', '“Statistical significance” and statistical reporting: Moving beyond binary', 'Journal of Marketing', '88', '3', '1–19', 'https://doi.org/10.1177/00222429231216910'),
	correlation: art('Papageorgiou, 2022', 'Papageorgiou, 2022', 'Papageorgiou, S. N.', '2022', 'On correlation coefficients and their interpretation', 'Journal of Orthodontics', '49', '3', '359–361', 'https://doi.org/10.1177/14653125221076142'),
	chiSquare: art('Assuah, Mensah-Wonkyi, Adusei, & Ghunney, 2022', 'Assuah et al., 2022', 'Assuah, C. K., Mensah-Wonkyi, T., Adusei, M. S., & Ghunney, S.', '2022', 'Walking mathematics students through the maze of chi-square test of independence and homogeneity, test involving several proportions, and goodness-of-fit test', 'Asian Journal of Probability and Statistics', '18', '4', '22–35', 'https://doi.org/10.9734/ajpas/2022/v18i430454'),
	visualization: art('Rollwagen & Manssour, 2026', 'Rollwagen & Manssour, 2026', 'Rollwagen, A. F., & Manssour, I. H.', '2026', 'Data visualization recommendation: Literature review and future perspectives', 'Information Visualization', '', '', '', 'https://doi.org/10.1177/14738716251409351', 'Advance online publication.'),
	inventory: art('Žic, Žic, Đukić, & Dabić-Miletić, 2024', 'Žic et al., 2024', 'Žic, J., Žic, S., Đukić, G., & Dabić-Miletić, S.', '2024', 'Exploring green inventory management through periodic review inventory systems—A comprehensive literature review and directions for future research', 'Sustainability', '16', '13', '5544', 'https://doi.org/10.3390/su16135544'),
	abcSelect: art('Khanorkar & Kane, 2023', 'Khanorkar & Kane, 2023', 'Khanorkar, Y., & Kane, P. V.', '2023', 'Selective inventory classification using ABC classification, multi-criteria decision making techniques, and machine learning techniques', 'Materials Today: Proceedings', '72', '', '1270–1274', 'https://doi.org/10.1016/j.matpr.2022.09.298'),
	abcMulti: art('Tavassoli & Farzipoor Saen, 2022', 'Tavassoli & Farzipoor Saen, 2022', 'Tavassoli, M., & Farzipoor Saen, R.', '2022', 'A stochastic data envelopment analysis approach for multi-criteria ABC inventory classification', 'Journal of Industrial and Production Engineering', '39', '6', '415–429', 'https://doi.org/10.1080/21681015.2022.2037761'),
	eoq: art('Nurprihatin, Rembulan, & Pratama, 2022', 'Nurprihatin et al., 2022', 'Nurprihatin, F., Rembulan, G. D., & Pratama, Y. D.', '2022', 'Comparing probabilistic economic order quantity and periodic order quantity model performance under lumpy demand environment', 'Management and Production Engineering Review', '13', '4', '16–25', 'https://doi.org/10.24425/mper.2022.142391'),
	concentration: art('Khansa & Shofwan, 2022', 'Khansa & Shofwan, 2022', 'Khansa, K. A., & Shofwan, S.', '2022', 'Perbandingan pengukuran struktur persaingan Herfindahl-Hirschman Index dan Concentration Ratio industri perbankan Indonesia', 'Contemporary Studies in Economic, Finance and Banking', '1', '3', '451–465', 'https://doi.org/10.21776/csefb.2022.01.3.08'),
	decisionTree: art('Bishnoi & Hooda, 2022', 'Bishnoi & Hooda, 2022', 'Bishnoi, S., & Hooda, B. K.', '2022', 'Decision tree algorithms and their applicability in agriculture for classification', 'Journal of Experimental Agriculture International', '44', '7', '20–27', 'https://doi.org/10.9734/jeai/2022/v44i730833'),
	decisionTreeApp: art('Arista, 2022', 'Arista, 2022', 'Arista, A.', '2022', 'Comparison decision tree and logistic regression machine learning classification algorithms to determine Covid-19', 'Sinkron', '7', '1', '59–65', 'https://doi.org/10.33395/sinkron.v7i1.11243'),
	statLearning: book('James et al., 2023', 'James et al., 2023', 'James, G., Witten, D., Hastie, T., Tibshirani, R., & Taylor, J.', '2023', 'An introduction to statistical learning: With applications in Python', '', 'Springer', 'https://doi.org/10.1007/978-3-031-38747-0'),
	metrics: art('Opitz, 2024', 'Opitz, 2024', 'Opitz, J.', '2024', 'A closer look at classification evaluation metrics and a critical reflection of common evaluation practice', 'Transactions of the Association for Computational Linguistics', '12', '', '820–836', 'https://doi.org/10.1162/tacl_a_00675'),
	confusion: art('Zeng, 2025', 'Zeng, 2025', 'Zeng, G.', '2025', 'Invariance properties and evaluation metrics derived from the confusion matrix in multiclass classification', 'Mathematics', '13', '16', '2609', 'https://doi.org/10.3390/math13162609'),
	kappa: art('Doğan & Doğan, 2022', 'Doğan & Doğan, 2022', 'Doğan, İ., & Doğan, N.', '2022', 'Evaluation of Cohen kappa coefficient and distinguishability for binary data: A simulation study', 'Turkiye Klinikleri Journal of Biostatistics', '14', '3', '190–198', 'https://doi.org/10.5336/biostatic.2022-89212'),
	crossValidation: art('Yates, Aandahl, Richards, & Brook, 2023', 'Yates et al., 2023', 'Yates, L. A., Aandahl, Z., Richards, S. A., & Brook, B. W.', '2023', 'Cross validation for model selection: A review with examples from ecology', 'Ecological Monographs', '93', '1', 'e1557', 'https://doi.org/10.1002/ecm.1557'),
	overfitting: art('Sheppert, 2026', 'Sheppert, 2026', 'Sheppert, A. P.', '2026', 'Techniques for mitigating overfitting in machine learning: A comprehensive review, taxonomy, and practical guide', 'Frontiers in Artificial Intelligence', '9', '', '1794271', 'https://doi.org/10.3389/frai.2026.1794271'),
	leakage: art('Alturayeif & Hassine, 2025', 'Alturayeif & Hassine, 2025', 'Alturayeif, N., & Hassine, J.', '2025', 'Data leakage detection in machine learning code: Transfer learning, active learning, or low-shot prompting?', 'PeerJ Computer Science', '11', '', 'e2730', 'https://doi.org/10.7717/peerj-cs.2730'),
	interpretable: art('Rudin, 2022', 'Rudin, 2022', 'Rudin, C.', '2022', 'Why black box machine learning should be avoided for high-stakes decisions, in brief', 'Nature Reviews Methods Primers', '2', '', 'Article 81', 'https://doi.org/10.1038/s43586-022-00172-0'),
	treeTabular: art('Grinsztajn, Oyallon, & Varoquaux, 2022', 'Grinsztajn et al., 2022', 'Grinsztajn, L., Oyallon, E., & Varoquaux, G.', '2022', 'Why do tree-based models still outperform deep learning on typical tabular data?', 'Advances in Neural Information Processing Systems', '35', '', '507–520', 'https://arxiv.org/abs/2207.08815'),
	tabular: art('Shwartz-Ziv & Armon, 2022', 'Shwartz-Ziv & Armon, 2022', 'Shwartz-Ziv, R., & Armon, A.', '2022', 'Tabular data: Deep learning is not all you need', 'Information Fusion', '81', '', '84–90', 'https://doi.org/10.1016/j.inffus.2021.11.011'),
};

/** Kunci sitasi internal artikel → entri katalog (satu karya dapat dipakai beberapa kali). */
const REF: Record<string, Ref> = {
	// kualitas data & data-centric
	wang96: CAT.dqDimensions, pipino02: CAT.dqFramework, batini09: CAT.dqAssessment,
	whang23: CAT.dqDeepLearning, zha25: CAT.dataCentric, sambasivan21: CAT.dqDeepLearning,
	northcutt21: CAT.dqFramework,
	// penataan & data hilang
	wilkinson16: CAT.dataCentric, wickham14: CAT.tidyData,
	han12: CAT.dataMining, han22: CAT.dataMining,
	little02: CAT.tidyData, rubin76: CAT.missingData, schafer02: CAT.imputation, kots06: CAT.imputation,
	// statistik, outlier, normalitas
	tukey77: CAT.iqr, hodge04: CAT.outlierStream, aggarwal17: CAT.outlierMeta,
	joanes98: CAT.normality, field18: CAT.skewness,
	sugiyono19: CAT.method, ghozali18: CAT.regression,
	// signifikansi, korelasi, regresi
	wasserstein16: CAT.significance, sullivan12: CAT.significance, cohen88: CAT.significance,
	pearson1895: CAT.correlation, schober18: CAT.significance, akoglu18: CAT.correlation,
	montgomery21: CAT.regression,
	// kategorikal
	pearsonchi00: CAT.chiSquare, cramer46: CAT.chiSquare, wilson31: CAT.chiSquare,
	// visualisasi
	tufte01: CAT.visualization,
	// persediaan
	silver98: CAT.inventory, heizer14: CAT.abcSelect, nahmias15: CAT.abcMulti,
	chopra19: CAT.eoq, waters03: CAT.inventory, ramanathan06: CAT.abcMulti,
	harris13: CAT.eoq, gastwirth72: CAT.concentration, rhoades93: CAT.concentration,
	// decision tree & evaluasi
	shannon48: CAT.decisionTree, quinlan86: CAT.decisionTree, quinlan93: CAT.decisionTree,
	breiman84: CAT.decisionTreeApp, hastie09: CAT.statLearning, james23: CAT.statLearning,
	pedregosa11: CAT.statLearning, kots07: CAT.decisionTreeApp, witten16: CAT.statLearning,
	sokolova09: CAT.metrics, powers11: CAT.confusion, grandini20: CAT.metrics,
	chicco20: CAT.confusion, cohen60: CAT.kappa, kohavi95: CAT.crossValidation,
	hawkins04: CAT.overfitting, kaufman12: CAT.leakage, rudin19: CAT.interpretable,
	grinsz22: CAT.treeTabular, shwartz22: CAT.tabular, sheetjs: CAT.statLearning,
};
