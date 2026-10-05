import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Logo + "SiSi" + "Sistem Integrasi" (splash & login lama).
class SisiBrand extends StatelessWidget {
  const SisiBrand({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
          'assets/images/logo-sisi.png',
          width: 108,
          height: 108,
          errorBuilder: (context, error, stack) => const Icon(Icons.hub, size: 90, color: AppColors.navy700),
        ),
        const SizedBox(height: 12),
        const Text('SiSi', style: TextStyle(fontSize: 40, fontWeight: FontWeight.w800, color: AppColors.navy900)),
        const Text('Sistem Integrasi', style: TextStyle(fontSize: 15, color: AppColors.neutral500)),
      ],
    );
  }
}

/// Lencana logo PLN di pojok kanan atas login.
class PlnBadge extends StatelessWidget {
  const PlnBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.neutral100,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.neutral200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .08), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Image.asset(
        'assets/images/logo-pln.png',
        errorBuilder: (context, error, stack) => const Icon(Icons.bolt, color: AppColors.plnRed),
      ),
    );
  }
}
